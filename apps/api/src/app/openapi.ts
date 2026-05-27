import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'

const authUserSchema = {
  additionalProperties: false,
  properties: {
    createdAt: { format: 'date-time', type: 'string' },
    displayName: { type: 'string' },
    email: { format: 'email', type: 'string' },
    id: { type: 'string' },
    role: { enum: ['user', 'admin'], type: 'string' },
    updatedAt: { format: 'date-time', type: 'string' },
    username: { type: 'string' },
  },
  required: ['createdAt', 'email', 'id', 'role', 'updatedAt'],
  type: 'object',
} as const

const authResponseSchema = {
  additionalProperties: false,
  properties: {
    session: {
      additionalProperties: false,
      properties: {
        expiresAt: { format: 'date-time', type: 'string' },
        id: { type: 'string' },
        token: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['expiresAt', 'id', 'token', 'userId'],
      type: 'object',
    },
    user: authUserSchema,
  },
  required: ['session', 'user'],
  type: 'object',
} as const

const apiErrorSchema = {
  additionalProperties: false,
  properties: {
    error: {
      additionalProperties: false,
      properties: {
        code: { type: 'string' },
        issues: {
          items: {
            additionalProperties: false,
            properties: {
              code: { type: 'string' },
              message: {
                description: 'Optional localized validation issue message.',
                type: 'string',
              },
              params: {
                additionalProperties: {
                  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
                },
                type: 'object',
              },
              path: {
                items: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
                type: 'array',
              },
            },
            required: ['path', 'code'],
            type: 'object',
          },
          type: 'array',
        },
        locale: {
          enum: ['en', 'zh-Hans'],
          type: 'string',
        },
        message: {
          description: 'Localized human-readable fallback. Clients must use error.code and structured fields for behavior.',
          type: 'string',
        },
        params: {
          additionalProperties: {
            oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
          },
          type: 'object',
        },
      },
      required: ['code', 'message'],
      type: 'object',
    },
  },
  required: ['error'],
  type: 'object',
} as const

const jsonContent = (schema: unknown) => ({
  'application/json': {
    schema,
  },
})

export const createOpenApiRouter = (): Hono => {
  const docs = new Hono()

  docs.get('/openapi.json', (c) =>
    c.json({
      openapi: '3.1.0',
      components: {
        parameters: {
          MinaLocaleHeader: {
            description: 'Optional locale for localized response messages. Supported values are en and zh-Hans.',
            in: 'header',
            name: 'X-Mina-Locale',
            required: false,
            schema: {
              enum: ['en', 'zh-Hans'],
              type: 'string',
            },
          },
        },
      },
      info: {
        description:
          'Mina API for authentication, typed task execution, workflow orchestration, media resources, and operational health.',
        title: 'Mina API',
        version: '0.1.0',
      },
      paths: {
        '/api/auth/login': {
          post: {
            parameters: [{ $ref: '#/components/parameters/MinaLocaleHeader' }],
            requestBody: {
              content: jsonContent({
                additionalProperties: false,
                properties: {
                  identifier: { type: 'string' },
                  password: { minLength: 8, type: 'string' },
                },
                required: ['identifier', 'password'],
                type: 'object',
              }),
              required: true,
            },
            responses: {
              200: {
                content: jsonContent(authResponseSchema),
                description: 'Authenticated session.',
              },
              401: {
                content: jsonContent(apiErrorSchema),
                description: 'Invalid credentials.',
              },
            },
            summary: 'Login with username or email and password',
            tags: ['Auth'],
          },
        },
        '/api/auth/register': {
          post: {
            parameters: [{ $ref: '#/components/parameters/MinaLocaleHeader' }],
            requestBody: {
              content: jsonContent({
                additionalProperties: false,
                properties: {
                  displayName: { type: 'string' },
                  email: { format: 'email', type: 'string' },
                  password: { minLength: 8, type: 'string' },
                  username: { maxLength: 64, minLength: 3, pattern: '^[a-zA-Z0-9_.-]+$', type: 'string' },
                },
                required: ['email', 'password', 'username'],
                type: 'object',
              }),
              required: true,
            },
            responses: {
              201: {
                content: jsonContent(authResponseSchema),
                description: 'Registered user and session.',
              },
              409: {
                content: jsonContent(apiErrorSchema),
                description: 'Username or email already exists.',
              },
            },
            summary: 'Register with username, email, and password',
            tags: ['Auth'],
          },
        },
        '/api/health': {
          get: {
            responses: {
              200: {
                content: jsonContent({
                  additionalProperties: false,
                  properties: {
                    service: { type: 'string' },
                    status: { const: 'ok', type: 'string' },
                    timestamp: { format: 'date-time', type: 'string' },
                  },
                  required: ['service', 'status', 'timestamp'],
                  type: 'object',
                }),
                description: 'Operational status.',
              },
            },
            summary: 'Health check',
            tags: ['System'],
          },
        },
        '/api/tasks': {
          get: {
            responses: {
              200: {
                description: 'Task list.',
              },
            },
            summary: 'List tasks',
            tags: ['Tasks'],
          },
          post: {
            responses: {
              201: {
                description: 'Queued task.',
              },
            },
            summary: 'Create task',
            tags: ['Tasks'],
          },
        },
        '/api/workflows': {
          get: {
            responses: {
              200: {
                description: 'Workflow list.',
              },
            },
            summary: 'List workflows',
            tags: ['Workflows'],
          },
          post: {
            responses: {
              201: {
                description: 'Created workflow.',
              },
            },
            summary: 'Create workflow',
            tags: ['Workflows'],
          },
        },
      },
      servers: [
        {
          description: 'Local API',
          url: 'http://localhost:3001',
        },
      ],
      tags: [
        { name: 'Auth' },
        { name: 'System' },
        { name: 'Tasks' },
        { name: 'Workflows' },
      ],
    }),
  )

  docs.get(
    '/docs',
    Scalar({
      pageTitle: 'Mina API Reference',
      url: '/openapi.json',
    }),
  )

  return docs
}
