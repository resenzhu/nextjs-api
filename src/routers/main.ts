import {askChatbot, disconnect, submitContactForm} from '@events/main';
import {getRedaction, logger} from '@utils/logger';
import type {Server} from 'socket.io';

const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

const mainRouter = async (server: Server): Promise<void> => {
  const main = server.of('/main');
  const chatbot = await dockStart().then((dock: any): any => dock.get('nlp')); // eslint-disable-line
  getRedaction({module: '@events/main'}).then((redaction) => {
    main.on('connection', (socket): void => {
      const mainLogger = logger.child(
        {
          namespace: 'main',
          socketid: socket.id
        },
        {
          redact: {
            paths: redaction,
            censor: '[redacted]'
          }
        }
      );
      mainLogger.info('socket connected');
      askChatbot(socket, mainLogger, {chatbot: chatbot});
      submitContactForm(socket, mainLogger);
      disconnect(socket, mainLogger);
    });
  });
};

export default mainRouter;
