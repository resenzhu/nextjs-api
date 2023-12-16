export type ErrorResponse = {
  success: false;
  error: {
    code: number;
    message: string;
  };
  data: Record<string, never>;
};

export type SuccessResponse = {
  success: true;
  error: Record<string, never>;
  data: object;
};

export type ClientResponse = {
  success: boolean;
  error:
    | {
        code: number;
        message: string;
      }
    | Record<string, never>;
  data: object;
};

export const createErrorResponse = ({
  code,
  message
}: {
  code: string | undefined;
  message: string | undefined;
}): ErrorResponse => ({
  success: false,
  error: {
    code: parseInt(code ?? '500', 10),
    message: message ?? 'internal server error.'
  },
  data: {}
});

export const createSuccessResponse = ({
  data = {}
}: {
  data?: object;
}): SuccessResponse => ({
  success: true,
  error: {},
  data: data
});

export const obfuscateResponse = (response: ClientResponse): ClientResponse => {
  if (!response.success) {
    const errorResponse = response as ErrorResponse;
    return {
      ...errorResponse,
      error: {
        ...errorResponse.error,
        message:
          errorResponse.error.code === 500
            ? 'internal server error.'
            : errorResponse.error.code === 503
              ? 'service unavailable.'
              : errorResponse.error.message
      }
    };
  }
  return response;
};
