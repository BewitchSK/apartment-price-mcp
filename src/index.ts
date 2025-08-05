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
          },
          required: ['address'],
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

// 아파트 실거래가 조회 함수
async function getApartmentPrice(args: {
  address: string;
  apartment_name?: string;
}) {
  const { address, apartment_name } = args;

  // 환경변수에서 API 키 가져오기
  const api_key = process.env.PUBLIC_DATA_API_KEY;

  if (!api_key) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ API 키가 설정되지 않았습니다.\n\n` +
              `MCP 설정 파일에서 PUBLIC_DATA_API_KEY 환경변수를 설정해주세요.\n` +
              `공공데이터포털(data.go.kr)에서 "아파트매매 실거래자료" API 키를 발급받아 사용하세요.`,
        },
      ],
    };
  }

  // 현재 년월 (최신 데이터 조회)
  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
  const dealYmd = currentYear + currentMonth;

  // 주소에서 지역코드 추출
  const regionInfo = getRegionCodeFromAddress(address);
  if (!regionInfo) {
    const supportedRegions = Object.keys(REGION_CODES).slice(0, 10).join(', ') + '...';
    return {
      content: [
        {
          type: 'text',
          text: `❌ 지원하지 않는 주소입니다: ${address}\n\n` +
              `지원 지역 예시: ${supportedRegions}\n` +
              `정확한 구 단위까지 입력해주세요. (예: 서울특별시 강남구, 경기도 성남시 분당구)`,
        },
      ],
    };
  }

  try {
    console.log(`조회 중: ${regionInfo.region} (${regionInfo.code}) - ${dealYmd}`);

    const apiData = await fetchRealEstateData(regionInfo.code, dealYmd, api_key);

    if (!apiData || !apiData.response || !apiData.response.body) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ API 호출 실패 또는 데이터가 없습니다.\n` +
                  `지역: ${regionInfo.region}\n` +
                  `조회 기간: ${currentYear}년 ${currentMonth}월\n\n` +
                  `API 키가 올바른지, 해당 지역에 거래 데이터가 있는지 확인해주세요.`,
          },
        ],
      };
    }

    const items = apiData.response.body.items;
    if (!items || !items.item) {
      return {
        content: [
          {
            type: 'text',
            text: `📭 ${regionInfo.region} 지역에서 ${currentYear}년 ${currentMonth}월 거래 내역을 찾을 수 없습니다.\n\n` +
                  `다른 월의 데이터를 확인하거나, 더 넓은 지역으로 검색해보세요.`,
          },
        ],
      };
    }

    // 배열로 변환 (단일 항목인 경우 배열로 만듦)
    const itemArray = Array.isArray(items.item) ? items.item : [items.item];

    // 아파트명 필터링
    let filteredItems = itemArray;
    if (apartment_name) {
      filteredItems = itemArray.filter((item: any) =>
        item.아파트 && item.아파트.includes(apartment_name)
      );

      if (filteredItems.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `📭 ${regionInfo.region} 지역에서 '${apartment_name}' 관련 거래 내역을 찾을 수 없습니다.\n\n` +
                    `전체 거래 내역: ${itemArray.length}건`,
            },
          ],
        };
      }
    }

    // 최대 15건까지 표시
    const displayItems = filteredItems.slice(0, 15);

    const result = displayItems.map((item: any, index: number) => {
      const price = item.거래금액 ? item.거래금액.replace(/,/g, '').trim() : '정보없음';
      const priceNum = parseInt(price);
      const formattedPrice = isNaN(priceNum) ? price : `${priceNum.toLocaleString()}만원`;

      return `${index + 1}. 📍 ${item.아파트 || '정보없음'}\n` +
             `   💰 거래가격: ${formattedPrice}\n` +
             `   📐 전용면적: ${item.전용면적 || '정보없음'}㎡\n` +
             `   🏢 층수: ${item.층 || '정보없음'}층\n` +
             `   📅 거래일: ${item.년 || currentYear}-${(item.월 || currentMonth).padStart(2, '0')}-${(item.일 || '01').padStart(2, '0')}\n` +
             `   🏗️ 건축년도: ${item.건축년도 || '정보없음'}년`;
    }).join('\n\n');

    const summaryText = apartment_name
      ? `'${apartment_name}' 관련 거래 ${displayItems.length}건`
      : `총 ${displayItems.length}건`;

    return {
      content: [
        {
          type: 'text',
          text: `🏠 **${regionInfo.region}** 아파트 실거래가 (${currentYear}년 ${currentMonth}월)\n` +
                `📊 ${summaryText} ${filteredItems.length > 15 ? '(상위 15건만 표시)' : ''}\n\n` +
                `${result}`,
        },
      ],
    };

  } catch (error) {
    console.error('API 호출 중 오류:', error);
    return {
      content: [
        {
          type: 'text',
          text: `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}\n\n` +
              `지역: ${regionInfo.region}\n` +
              `API 키와 네트워크 연결을 확인해주세요.`,
        },
      ],
    };
  }
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