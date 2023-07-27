import {Server, Socket} from 'socket.io';
import logger from '@utils/logger';

type AskChatbotReq = {
  input: string;
};

type AskChatbotRes = {
  reply: string;
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
        const response: AskChatbotRes = {
          reply: request.input
        };
        mainLogger.info({response: response}, 'ask chatbot response');
        callback(response);
      }
    );
  });
};

export default mainRouter;
