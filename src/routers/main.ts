import {Server, Socket} from 'socket.io';
import joi from 'joi';
import logger from '@utils/logger';
import {sanitize} from 'isomorphic-dompurify';

type AskChatbotReq = {
  input: string;
};

type AskChatbotRes = {
  success: boolean;
  error: {
    status: number;
    subStatus: number;
    message: string;
  } | null;
  data: {
    reply: string;
  } | null;
};

const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

const mainRouter = async (server: Server): Promise<void> => {
  const main = server.of('/main');
  // eslint-disable-next-line
  const chatbot = await dockStart({use: ['Basic']}).then((dock: any): any => {
    logger.info('chatbot started');
    const nlp = dock.get('nlp');
    nlp.load('chatbot.nlp');
    return nlp;
  });
  main.on('connection', (socket: Socket): void => {
    const mainLogger = logger.child({
      namespace: 'main',
      socketid: socket.id
    });
    mainLogger.info('socket connected');
    socket.on(
      'ask-chatbot',
      async (
        request: AskChatbotReq,
        callback: (response: AskChatbotRes) => void
      ): Promise<void> => {
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
        const reply = await chatbot.process(sanitize(data.input).trim());
        const response: AskChatbotRes = {
          success: true,
          error: null,
          data: {
            reply: reply.answer
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
