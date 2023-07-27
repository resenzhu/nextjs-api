import {Server, Socket} from 'socket.io';
import joi from 'joi';
import logger from '@utils/logger';

type AskChatbotReq = {
  input: string;
};

type AskChatbotRes = {
  success: boolean;
  error: {status: number; subStatus: number; message: string} | null;
  data: {
    reply: string;
  } | null;
};

const mainRouter = (server: Server) => {
  const main = server.of('/main');
  main.on('connection', (socket: Socket): void => {
    const mainLogger = logger.child({namespace: 'main', socketid: socket.id});
    mainLogger.info('socket connected');

    socket.on(
      'ask-chatbot',
      (
        request: AskChatbotReq,
        callback: (response: AskChatbotRes) => void
      ): void => {
        mainLogger.info({request: request}, 'ask chatbot');
        const requestSchema = joi.object({
          input: joi.string().min(1).max(160)
        });
        const {value, error} = requestSchema.validate(request);
        if (error) {
          const response: AskChatbotRes = {
            success: false,
            error: {
              status: 400,
              subStatus: 0,
              message: 'bad request'
            },
            data: null
          };
          mainLogger.warn({response: response}, 'ask chatbot failed');
          callback(response);
        }
        const data = value as AskChatbotReq;
        const response: AskChatbotRes = {
          success: true,
          error: null,
          data: {
            reply: data.input
          }
        };
        mainLogger.info({response: response}, 'ask chatbot success');
        callback(response);
      }
    );
  });
};

export type {AskChatbotReq, AskChatbotRes};
export default mainRouter;
