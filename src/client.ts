import {
  animals,
  colors,
  names,
  uniqueNamesGenerator
} from 'unique-names-generator';
import {LoremIpsum} from 'lorem-ipsum';
import {Manager} from 'socket.io-client';
import {config} from 'dotenv';
import {logger} from '@utils/logger';

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
const breezySocket = socketManager.socket('/project/breezy', {
  auth: {
    token: ''
  }
});

const call = (
  socket: typeof mainSocket,
  event: string,
  request?: object
): void => {
  if (request) {
    socket
      .timeout(5000)
      .emit(event, request, (socketError: Error, response: object): void => {
        if (socketError) {
          logger.error(socketError, event);
        } else {
          logger.info({request: request, response: response}, event);
        }
        process.exit();
      });
  } else {
    socket
      .timeout(5000)
      .emit(event, (socketError: Error, response: object): void => {
        if (socketError) {
          logger.error(socketError, event);
        } else {
          logger.info({response: response}, event);
        }
        process.exit();
      });
  }
};

const mainEvent: {
  askChatbot: () => void;
  submitContactForm: () => void;
  skip: () => void;
} = {
  askChatbot: (): void => {
    call(mainSocket, 'ask chatbot', {
      input: 'hello'
    });
  },
  submitContactForm: (): void => {
    const name = uniqueNamesGenerator({
      dictionaries: [names, names, names],
      length: Math.floor(Math.random() * 3 + 1),
      separator: ' '
    });
    call(mainSocket, 'submit contact form', {
      name: name,
      email: `${name.replaceAll(' ', '.').toLowerCase()}@email.com`,
      message: new LoremIpsum().generateParagraphs(1),
      honeypot: ''
    });
  },
  skip: (): void => {
    mainSocket.disconnect();
  }
};

const breezyEvent: {
  signup: () => void;
  login: () => void;
  fetchUsers: () => void;
  fetchProfile: () => void;
  updateUserStatus: () => void;
  skip: () => void;
} = {
  signup: (): void => {
    const name = uniqueNamesGenerator({
      dictionaries: [names, names],
      length: Math.floor(Math.random() * 2 + 1),
      separator: ' '
    });
    const password = uniqueNamesGenerator({
      dictionaries: [colors, animals],
      length: 2
    });
    call(breezySocket, 'signup', {
      username: name.split(' ')[0]?.toLowerCase(),
      displayName: name,
      password: password,
      honeypot: '',
      recaptcha: process.env.APP_CLIENT_RECAPTCHA_DUMMY
    });
  },
  login: (): void => {
    call(breezySocket, 'login', {
      username: '',
      password: '',
      honeypot: '',
      recaptcha: process.env.APP_CLIENT_RECAPTCHA_DUMMY
    });
  },
  fetchUsers: (): void => {
    call(breezySocket, 'fetch users');
  },
  fetchProfile: (): void => {
    call(breezySocket, 'fetch profile');
  },
  updateUserStatus: (): void => {
    call(breezySocket, 'update user status', {status: 'appear away'});
  },
  skip: (): void => {
    breezySocket.disconnect();
  }
};

mainEvent.skip();
breezyEvent.signup();
