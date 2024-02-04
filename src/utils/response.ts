import type {Logger} from 'pino';

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

export type Response = ErrorResponse | SuccessResponse;

export const createResponse = (
  parameter:
    | {
        event: string;
        logger: Logger;
        code: string;
        message: string;
        detail?: string;
      }
    | {event: string; logger: Logger; data?: object}
): Response => {
  if ('code' in parameter) {
    const {event, logger, code, message, detail} = parameter;
    let response: Response = {
      success: false,
      error: {
        code: parseInt(code ?? '500', 10),
        message: message ?? 'internal server error.'
      },
      data: {}
    };
    logger.warn(
      detail ? {response: response, error: detail} : {response: response},
      `${event} failed`
    );
    if ([500, 503].includes(response.error.code)) {
      response = {
        ...response,
        error: {
          ...response.error,
          message:
            response.error.code === 500
              ? 'internal server error.'
              : response.error.code === 503
                ? 'service unavailable.'
                : response.error.message
        }
      };
    }
    return response;
  }
  const {event, logger, data} = parameter;
  const response: Response = {
    success: true,
    error: {},
    data: data ?? {}
  };
  logger.info({response: response}, `${event} success`);
  return response;
};
