import {type JwtPayload, verifyJwt} from '@utils/breezy';
import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';

const logoutEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'logout';
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
                connection
                  .execute(
                    'CALL SP_BREEZY_UPDATE_USER (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status, :updateLastOnline)',
                    {
                      userId: userResult.userid,
                      userName: userResult.username,
                      displayName: userResult.displayname,
                      password: userResult.password,
                      sessionId: userResult.sessionid,
                      socketId: null,
                      status: 'offline',
                      updateLastOnline: 1
                    }
                  )
                  .then((): void => {
                    connection
                      .execute(
                        'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)',
                        {userId: userResult.userid}
                      )
                      .then((offlineUserPacket): void => {
                        const [offlineUserResult] = (
                          offlineUserPacket[0] as ProcedureCallPacket<
                            RowDataPacket[]
                          >
                        )[0];
                        if (!offlineUserResult) {
                          return callback(
                            createResponse({
                              event: event,
                              logger: logger,
                              code: '500',
                              message: 'offline user was not found.'
                            })
                          );
                        }
                        const offlineUser: User = {
                          id: offlineUserResult.userid,
                          userName: offlineUserResult.username,
                          displayName: offlineUserResult.displayname,
                          password: offlineUserResult.password,
                          joinDate: offlineUserResult.createdtime,
                          session: {
                            id: offlineUserResult.sessionid,
                            socket: offlineUserResult.socketid,
                            status: offlineUserResult.status,
                            lastOnline: offlineUserResult.lastonline
                          }
                        };
                        const userStatusNotif: UserStatusNotif = {
                          user: {
                            id: offlineUser.id,
                            session: {
                              status: offlineUser.session.status
                                .replace('appear', '')
                                .trim() as 'online' | 'away' | 'offline',
                              lastOnline: offlineUser.session.lastOnline
                            }
                          }
                        };
                        socket.broadcast.emit(
                          'update user status',
                          userStatusNotif
                        );
                        return callback(
                          createResponse({
                            event: event,
                            logger: logger
                          })
                        );
                      });
                  });
                return undefined;
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

export default logoutEvent;
