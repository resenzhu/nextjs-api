import {askChatbot, disconnect, submitContactForm} from '@events/main';
import type {Server} from 'socket.io';
import logger from '@utils/logger';

const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

const mainRouter = async (server: Server): Promise<void> => {
  const main = server.of('/main');
  const chatbot = await dockStart().then((dock: any): any => dock.get('nlp')); // eslint-disable-line
  main.on('connection', (socket): void => {
    const mainLogger = logger.child({
      namespace: 'main',
      socketid: socket.id
    });
    mainLogger.info('socket connected');
    askChatbot(socket, mainLogger, {chatbot: chatbot});
    submitContactForm(socket, mainLogger);
    disconnect(socket, mainLogger);
  });
};

export default mainRouter;
