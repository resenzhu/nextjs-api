import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';

type AskChatbotReq = {
  input: string;
};

const askChatbotEvent = (
  socket: Socket,
  logger: Logger,
  {chatbot}: {chatbot: any} // eslint-disable-line
): void => {
  socket.on(
    'ask-chatbot',
    async (
      request: AskChatbotReq,
      callback: (response: ClientResponse) => void
    ): Promise<void> => {
      logger.info({request: request}, 'ask chatbot');
      const requestSchema = joi.object({
        input: joi.string().min(1).max(160).required().messages({
          'string.base': "4220101|'input' must be a string.",
          'string.empty': "4220102|'input' must not be empty.",
          'string.min': "4220103|'input' must be between 1 and 160 characters.",
          'string.max': "4220104|'input' must be between 1 and 160 characters.",
          'any.required': "40001|'input' is required."
        })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      if (validationError) {
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, 'ask chatbot failed');
        return callback(response);
      }
      let data = validatedValue as AskChatbotReq;
      data = {
        ...data,
        input: sanitize(data.input).trim()
      };
      const reply = await chatbot.process(data.input);
      const response: ClientResponse = createSuccessResponse({
        data: {
          reply: reply.answer
        }
      });
      logger.info({response: response}, 'ask chatbot success');
      return callback(response);
    }
  );
};

export type {AskChatbotReq};
export default askChatbotEvent;
