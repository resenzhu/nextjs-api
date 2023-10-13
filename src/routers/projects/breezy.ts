import {type VerifyErrors, verify} from 'jsonwebtoken';
import {connect, disconnect, login, signup} from '@events/projects/breezy';
import type {Server} from 'socket.io';
import logger from '@utils/logger';
import {redact as loginRedact} from '@events/projects/breezy/login';
import {redact as signupRedact} from '@events/projects/breezy/signup';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.use((socket, next): void => {
    const {token} = socket.handshake.auth;
    if (token) {
      verify(
        token,
        Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString(),
        (jwtError: VerifyErrors | null) => {
          if (jwtError) {
            next(new Error(jwtError.name));
          } else {
            next();
          }
        }
      );
    } else {
      next();
    }
  });
  breezy.on('connection', (socket): void => {
    const breezyRedact = [...signupRedact, ...loginRedact];
    const breezyLogger = logger.child(
      {
        namespace: 'project/breezy',
        socketid: socket.id
      },
      {redact: {paths: breezyRedact, censor: '[redacted]'}}
    );
    connect(socket, breezyLogger);
    signup(socket, breezyLogger);
    login(socket, breezyLogger);
    disconnect(socket, breezyLogger);
  });
};

export default breezyRouter;
