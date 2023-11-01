import {type ClientResponse, createErrorResponse} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import joi from 'joi';

type UpdateUserStatusReq = {
  status: 'online' | 'appear away' | 'appear offline';
};

const updateUserStatusEvent = (socket: Socket, logger: Logger): void => {
  socket.on(
    'update user status',
    (
      request: UpdateUserStatusReq,
      callback: (response: ClientResponse) => void
    ): void => {
      logger.info({request: request}, 'update user status');
      const requestSchema = joi.object({
        status: joi
          .string()
          .valid('online', 'appear away', 'appear offline')
          .required()
          .messages({
            'string.base': "422|'status' must be a string.",
            'string.empty': "422|'status' must not be empty.",
            'any.only':
              "422|'status' must be 'online', 'appear away', or 'appear offline'.",
            'any.required': "400|'status' is required."
          })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      console.log(validatedValue);
      if (validationError) {
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, 'update user status failed');
        return callback(response);
      }
    }
  );
};

export default updateUserStatusEvent;
