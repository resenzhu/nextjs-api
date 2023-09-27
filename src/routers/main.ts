import type {Server} from 'socket.io';
import askChatbot from '@events/main/ask-chatbot';
import disconnect from '@events/main/disconnect';
import logger from '@utils/logger';
import submitContactForm from '@events/main/submit-contact-form';

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
