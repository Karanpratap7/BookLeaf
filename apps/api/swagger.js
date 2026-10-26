const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "BookLeaf Author Portal API",
      version: "1.0.0",
      description:
        "BookLeaf Author Support & Communication Portal API - Vue 3 + Node.js + PostgreSQL",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication and user session" },
      { name: "Author", description: "Author-facing endpoints" },
      { name: "Admin", description: "Admin portal endpoints" },
      { name: "Tickets", description: "Support ticket endpoints" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Short error summary",
            },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "API path or field name",
                  },
                  message: {
                    type: "string",
                    description: "Human-readable error message",
                  },
                },
              },
              description: "Validation or runtime error details",
            },
          },
          required: ["error"],
        },
        TicketResponse: {
          type: "object",
          properties: {
            id: { type: "string" },
            subject: { type: "string" },
            description: { type: "string" },
            status: { type: "string" },
            category: { type: "string" },
            priority: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        UserSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            role: { type: "string" },
          },
          required: ["id", "name", "email", "role"],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./index.ts"], // Scan route files for JSDoc annotations
};

module.exports = swaggerOptions;