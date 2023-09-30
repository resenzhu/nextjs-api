import {disconnect, login, signup} from '@events/projects/breezy';
import type {Server} from 'socket.io';
import logger from '@utils/logger';
import {redact as loginRedact} from '@events/projects/breezy/login';
import {redact as signupRedact} from '@events/projects/breezy/signup';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.on('connection', (socket): void => {
    const breezyRedact = [...signupRedact, ...loginRedact];
    const breezyLogger = logger.child(
      {
        namespace: 'project/breezy',
        socketid: socket.id
      },
      {redact: {paths: breezyRedact, censor: '[redacted]'}}
    );
    breezyLogger.info('socket connected');
    signup(socket, breezyLogger);
    login(socket, breezyLogger);
    disconnect(socket, breezyLogger);
  });
};

export default breezyRouter;
