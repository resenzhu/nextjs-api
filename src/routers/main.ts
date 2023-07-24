import {Server, Socket} from 'socket.io';
import logger from '@utils/logger';

const {dockStart} = require('@nlpjs/basic');

const mainRouter = (server: Server) => {
  const main = server.of('/main');
  let chatbot: any = null;

  main.on('connection', (socket: Socket): void => {
    const mainLogger = logger.child({scope: 'main', socketid: socket.id});
    mainLogger.info('socket connected');

    socket.on('ask-chatbot', async (): Promise<void> => {
      if (!chatbot) {
        chatbot = await dockStart().then((dock: any): void => dock.get('nlp'));
      }
      chatbot
        .process('en', 'what is your birthday')
        .then((reply: any): void => console.log(reply.answer));
    });
  });
};

export default mainRouter;
