import {type JwtPayload, verifyJwt} from '@utils/breezy';
import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
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
              .execute(
                `SELECT DISTINCT userid, username, displayname, password, sessionid, socketid, status, lastonline, createdtime FROM breezy_users
                 WHERE userid = :userId AND TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) <= 14
                 LIMIT 1`,
                {
                  userId: verifiedJwt.id,
                  currentDate: DateTime.utc().toISODate()
                }
              )
              .then((packet): void => {
                const [userResult] = packet[0] as RowDataPacket[];
                if (!userResult) {
                  return callback(
                    createResponse({
                      event: event,
                      logger: logger,
                      code: '404',
                      message: 'user was not found.'
                    })
                  );
                }
                const existingUser: User = {
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
                        id: existingUser.id,
                        username: existingUser.userName,
                        displayName: existingUser.displayName,
                        session: {
                          status: existingUser.session.status,
                          lastOnline: existingUser.session.lastOnline
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
