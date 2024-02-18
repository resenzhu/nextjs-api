import {type JwtPayload, verifyJwt} from '@utils/breezy';
import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy';
import {database} from '@utils/database';

const fetchProfileEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'fetch profile';
  socket.on(event, (callback: (response: Response) => void): void => {
    logger.info(event);
    verifyJwt(socket)
      .then((jwtPayload): void => {
        const verifiedJwt = jwtPayload as JwtPayload;
        database
          .getConnection()
          .then((connection): void => {
            connection
              .execute('CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)', {
                userId: verifiedJwt.id
              })
              .then((userPacket): void => {
                const [userResult] = (
                  userPacket[0] as ProcedureCallPacket<RowDataPacket[]>
                )[0];
                if (!userResult) {
                  return callback(
                    createResponse({
                      event: event,
                      logger: logger,
                      code: '404',
                      message: 'current user was not found.'
                    })
                  );
                }
                const currentUser: User = {
                  id: userResult.userid,
                  userName: userResult.username,
                  displayName: userResult.displayname,
                  password: userResult.password,
                  joinDate: userResult.createdtime,
                  session: {
                    id: userResult.sessionid,
                    socket: userResult.socketid,
                    status: userResult.status,
                    lastOnline: userResult.lastonline
                  }
                };
                return callback(
                  createResponse({
                    event: event,
                    logger: logger,
                    data: {
                      user: {
                        id: currentUser.id,
                        username: currentUser.userName,
                        displayName: currentUser.displayName,
                        session: {
                          status: currentUser.session.status,
                          lastOnline: currentUser.session.lastOnline
                        }
                      }
                    }
                  })
                );
              })
              .finally((): void => {
                connection.release();
              });
          })
          .catch((connectionError: NodeJS.ErrnoException): void =>
            callback(
              createResponse({
                event: event,
                logger: logger,
                code: '500',
                message: 'an error occured while connecting to database.',
                detail: connectionError.message
              })
            )
          );
      })
      .catch((jwtError: Error): void =>
        callback(
          createResponse({
            event: event,
            logger: logger,
            code: jwtError.message.split('|')[0],
            message: jwtError.message.split('|')[1],
            detail:
              jwtError.message.split('|')[2] ?? jwtError.message.split('|')[1]
          })
        )
      );
  });
};

export default fetchProfileEvent;
