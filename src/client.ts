import {names, uniqueNamesGenerator} from 'unique-names-generator';
import {LoremIpsum} from 'lorem-ipsum';
import {Manager} from 'socket.io-client';
import {config} from 'dotenv';
import logger from '@utils/logger';

if (process.env.NODE_ENV === 'production') {
  logger.error(
    'This script is not intended to be run in a production environment. Please execute this script only in a non-production environment.'
  );
  process.exit();
}

config();

const socketManager = new Manager(`ws://localhost:${process.env.APP_PORT}`, {
  transports: ['websocket', 'polling'],
  rejectUnauthorized: false
});

const mainSocket = socketManager.socket('/main');

const call = (
  socket: typeof mainSocket,
  event: string,
  request: object
): void => {
  socket
    .timeout(5000)
    .emit(event, request, (error: Error, response: object): void => {
      if (error) {
        logger.error(error, event);
      } else {
        logger.info({request: request, response: response}, event);
      }
      process.exit();
    });
};

const mainEvent: {
  askChatbot: () => void;
  submitContactForm: () => void;
} = {
  askChatbot: (): void => {
    call(mainSocket, 'ask-chatbot', {
      input: 'hello'
    });
  },
  submitContactForm: (): void => {
    const name = uniqueNamesGenerator({
      dictionaries: [names, names, names],
      length: Math.floor(Math.random() * 3 + 1),
      separator: ' '
    });
    call(mainSocket, 'submit-contact-form', {
      name: name,
      email: `${name.replaceAll(' ', '.').toLowerCase()}@email.com`,
      message: new LoremIpsum().generateParagraphs(1),
      honeypot: ''
    });
  }
};

mainEvent.submitContactForm();
