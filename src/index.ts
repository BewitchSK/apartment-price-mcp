import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

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

// 간단한 테스트 도구부터
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'get_apartment_price',
        description: '아파트 실거래가 조회',
        inputSchema: {
          type: 'object',
          properties: {
            region: { type: 'string', description: '지역명' },
          },
          required: ['region'],
        },
      },
    ],
  };
});

const transport = new StdioServerTransport();
server.connect(transport);