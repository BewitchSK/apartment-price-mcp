import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// MCP 서버 초기화
const server = new Server(
  {
    name: 'apartment-price-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 아파트 실거래가 조회 도구 목록
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_apartment_price',
        description: '주소를 입력하면 해당 지역의 아파트 실거래가를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: '조회할 주소 (예: 서울특별시 강남구, 경기도 성남시 분당구)',
            },
            apartment_name: {
              type: 'string',
              description: '특정 아파트명 (선택사항)',
            },
            api_key: {
              type: 'string',
              description: '공공데이터포털 API 키 (data.go.kr에서 발급)',
            },
          },
          required: ['address', 'api_key'],
        },
      },
    ],
  };
});

// 도구 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_apartment_price':
        return await getApartmentPrice(args as any);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// 주소에서 지역코드 매핑
const REGION_CODES: { [key: string]: string } = {
  // 서울특별시
  '강남구': '11680', '서초구': '11650', '송파구': '11710', '강동구': '11740',
  '마포구': '11440', '용산구': '11170', '성동구': '11200', '광진구': '11215',
  '동대문구': '11230', '중랑구': '11260', '성북구': '11290', '강북구': '11305',
  '도봉구': '11320', '노원구': '11350', '은평구': '11380', '서대문구': '11410',
  '종로구': '11110', '중구': '11140', '영등포구': '11560', '구로구': '11530',
  '금천구': '11545', '양천구': '11470', '강서구': '11500', '관악구': '11620',
  '동작구': '11590',

  // 경기도 주요 지역
  '수원시 영통구': '41117', '수원시 장안구': '41111', '수원시 권선구': '41113', '수원시 팔달구': '41115',
  '성남시 수정구': '41131', '성남시 중원구': '41133', '성남시 분당구': '41135',
  '고양시 덕양구': '41281', '고양시 일산동구': '41285', '고양시 일산서구': '41287',
  '용인시 처인구': '41461', '용인시 기흥구': '41463', '용인시 수지구': '41465',
  '부천시': '41190', '안산시 상록구': '41271', '안산시 단원구': '41273',
  '안양시 만안구': '41171', '안양시 동안구': '41173',
  '남양주시': '41360', '화성시': '41590', '평택시': '41220', '의정부시': '41150',
  '시흥시': '41390', '파주시': '41480', '광명시': '41210', '김포시': '41570',
  '군포시': '41410', '하남시': '41450', '오산시': '41370', '양주시': '41630',
  '구리시': '41310', '안성시': '41550', '포천시': '41650', '의왕시': '41430',
  '여주시': '41670', '동두천시': '41250', '과천시': '41290',
};

// 주소에서 지역코드 추출
function getRegionCodeFromAddress(address: string): { code: string, region: string } | null {
  const normalizedAddress = address.replace(/\s+/g, '').toLowerCase();

  for (const [region, code] of Object.entries(REGION_CODES)) {
    const normalizedRegion = region.replace(/\s+/g, '').toLowerCase();
    if (normalizedAddress.includes(normalizedRegion)) {
      return { code, region };
    }
  }

  return null;
}

// 실제 공공 API 호출 함수
async function fetchRealEstateData(regionCode: string, dealYmd: string, apiKey: string) {
  const baseUrl = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc';

  try {
    const response = await axios.get(`${baseUrl}/getRTMSDataSvcAptTradeDev`, {
      params: {
        serviceKey: apiKey,
        LAWD_CD: regionCode,
        DEAL_YMD: dealYmd,
        numOfRows: 100,
        pageNo: 1,
      },
    });

    return response.data;
  } catch (error) {
    console.error('API 호출 오류:', error);
    return null;
  }
}
// 아파트 실거래가 조회 함수
async function getApartmentPrice(args: {
  region: string;
  apartment_name?: string;
  year?: string;
  month?: string;
  api_key?: string;
}) {
  const { region, apartment_name, year, month, api_key } = args;

  const currentYear = year || new Date().getFullYear().toString();
  const currentMonth = month || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const dealYmd = currentYear + currentMonth;

  // 지역코드 확인
  const regionCode = REGION_CODES[region];
  if (!regionCode) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 지원하지 않는 지역입니다: ${region}\n\n지원 지역: ${Object.keys(REGION_CODES).join(', ')}`,
        },
      ],
    };
  }

  try {
    // API 키가 있는 경우에만 실제 API 호출
    if (api_key) {
      const apiData = await fetchRealEstateData(regionCode, dealYmd, api_key);

      if (apiData && apiData.response && apiData.response.body && apiData.response.body.items) {
      // 실제 API 데이터 처리
      const items = Array.isArray(apiData.response.body.items.item)
        ? apiData.response.body.items.item
        : [apiData.response.body.items.item];

      let filteredItems = items;
      if (apartment_name) {
        filteredItems = items.filter((item: any) =>
          item.아파트 && item.아파트.includes(apartment_name)
        );
      }

      if (filteredItems.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `${region} 지역에서 ${apartment_name ? `'${apartment_name}' 관련 ` : ''}거래 내역을 찾을 수 없습니다.`,
            },
          ],
        };
      }

      const result = filteredItems.slice(0, 10).map((item: any) =>
        `📍 ${item.아파트 || '정보없음'} (${region})\n` +
        `💰 거래가격: ${item.거래금액 || '정보없음'}만원\n` +
        `📐 전용면적: ${item.전용면적 || '정보없음'}㎡\n` +
        `🏢 층수: ${item.층 || '정보없음'}층\n` +
        `📅 거래일: ${item.년 || currentYear}-${item.월 || currentMonth}-${item.일 || '정보없음'}\n` +
        `🏗️ 건축년도: ${item.건축년도 || '정보없음'}\n`
      ).join('\n---\n');

      return {
        content: [
          {
            type: 'text',
            text: `${region} 지역 아파트 실거래가 정보 (${currentYear}년 ${currentMonth}월):\n\n${result}`,
          },
        ],
      };
    }
  } catch (error) {
    console.error('API 호출 중 오류:', error);
  }

  // API 호출 실패 시 더미 데이터 반환
  const mockData = [
    {
      apartmentName: apartment_name || '래미안아파트',
      region: region,
      price: '85,000만원',
      area: '84㎡',
      floor: '15층',
      transactionDate: `${currentYear}-${currentMonth}-15`,
      buildYear: '2018',
    },
    {
      apartmentName: apartment_name || '아크로아파트',
      region: region,
      price: '92,000만원',
      area: '104㎡',
      floor: '8층',
      transactionDate: `${currentYear}-${currentMonth}-22`,
      buildYear: '2020',
    },
  ];

  const result = mockData
    .filter(item => !apartment_name || item.apartmentName.includes(apartment_name))
    .map(item =>
      `📍 ${item.apartmentName} (${item.region})\n` +
      `💰 거래가격: ${item.price}\n` +
      `📐 전용면적: ${item.area}\n` +
      `🏢 층수: ${item.floor}\n` +
      `📅 거래일: ${item.transactionDate}\n` +
      `🏗️ 건축년도: ${item.buildYear}\n`
    )
    .join('\n---\n');

  return {
    content: [
      {
        type: 'text',
        text: `${region} 지역 아파트 실거래가 정보 (API 연결 실패 - 샘플 데이터):\n\n${result}`,
      },
    ],
  };
}

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Apartment Price MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});