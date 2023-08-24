export type ErrorResponse = {
  success: false;
  error: {
    code: number;
    message: string;
  };
  data: {};
};

export type SuccessResponse = {
  success: true;
  error: {};
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
    code: parseInt(code ?? '400'),
    message:
      message ??
      'the server cannot process the request due to invalid syntax or malformed structure'
  },
  data: {}
});

export const createSuccessResponse = ({
  data = {}
}: {
  data: object;
}): SuccessResponse => ({
  success: true,
  error: {},
  data: data
});
