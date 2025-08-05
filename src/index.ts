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
        description: '지역별 아파트 실거래가를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            region: {
              type: 'string',
              description: '조회할 지역명 (예: 강남구, 서초구)',
            },
            apartment_name: {
              type: 'string',
              description: '아파트명 (선택사항)',
            },
            year: {
              type: 'string',
              description: '조회 연도 (YYYY 형식, 기본값: 현재년도)',
            },
            month: {
              type: 'string',
              description: '조회 월 (MM 형식, 기본값: 현재월)',
            },
          },
          required: ['region'],
        },
      },
      {
        name: 'analyze_price_trend',
        description: '특정 아파트의 가격 트렌드를 분석합니다',
        inputSchema: {
          type: 'object',
          properties: {
            region: {
              type: 'string',
              description: '지역명',
            },
            apartment_name: {
              type: 'string',
              description: '아파트명',
            },
            period_months: {
              type: 'number',
              description: '분석 기간 (개월 수, 기본값: 12)',
            },
          },
          required: ['region', 'apartment_name'],
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

      case 'analyze_price_trend':
        return await analyzePriceTrend(args as any);

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
  region: string;
  apartment_name?: string;
  year?: string;
  month?: string;
}) {
  const { region, apartment_name, year, month } = args;

  // 현재는 더미 데이터 반환 (나중에 실제 API 연동)
  const currentYear = year || new Date().getFullYear().toString();
  const currentMonth = month || (new Date().getMonth() + 1).toString().padStart(2, '0');

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
        text: `${region} 지역 아파트 실거래가 정보:\n\n${result}`,
      },
    ],
  };
}

// 가격 트렌드 분석 함수
async function analyzePriceTrend(args: {
  region: string;
  apartment_name: string;
  period_months?: number;
}) {
  const { region, apartment_name, period_months = 12 } = args;

  // 더미 트렌드 데이터
  const trendData = Array.from({ length: period_months }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (period_months - 1 - i));
    const basePrice = 80000;
    const variation = Math.sin(i * 0.5) * 5000 + Math.random() * 3000;

    return {
      month: date.toISOString().slice(0, 7),
      avgPrice: Math.round(basePrice + variation),
      transactionCount: Math.floor(Math.random() * 10) + 1,
    };
  });

  const trend = trendData.map(item =>
    `${item.month}: ${item.avgPrice.toLocaleString()}만원 (거래 ${item.transactionCount}건)`
  ).join('\n');

  const firstPrice = trendData[0].avgPrice;
  const lastPrice = trendData[trendData.length - 1].avgPrice;
  const priceChange = lastPrice - firstPrice;
  const changePercentNum = (priceChange / firstPrice) * 100;
  const changePercent = changePercentNum.toFixed(1);

  return {
    content: [
      {
        type: 'text',
        text: `${apartment_name} (${region}) ${period_months}개월 가격 트렌드:\n\n${trend}\n\n` +
              `📊 분석 결과:\n` +
              `• 시작 가격: ${firstPrice.toLocaleString()}만원\n` +
              `• 현재 가격: ${lastPrice.toLocaleString()}만원\n` +
              `• 변동폭: ${priceChange > 0 ? '+' : ''}${priceChange.toLocaleString()}만원 (${changePercentNum > 0 ? '+' : ''}${changePercent}%)\n` +
              `• 추세: ${priceChange > 0 ? '상승📈' : priceChange < 0 ? '하락📉' : '보합➡️'}`,
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