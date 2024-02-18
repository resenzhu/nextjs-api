import {type JwtPayload, verifyJwt} from '@utils/breezy';
import type {Namespace, Socket} from 'socket.io';
import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import type {Logger} from 'pino';
import {database} from '@utils/database';

const fetchUsersEvent = (
  socket: Socket,
  logger: Logger,
  {namespace}: {namespace: Namespace}
): void => {
  const event: string = 'fetch users';
  socket.on(event, (callback: (response: Response) => void): void => {
    logger.info(event);
    verifyJwt(socket)
      .then((jwtPayload): void => {
        const verifiedJwt = jwtPayload as JwtPayload;
        database
          .getConnection()
          .then((connection): void => {
            connection
              .execute('CALL SP_BREEZY_GET_ACTIVE_USERS')
              .then((usersPacket): void => {
                const [usersResult] = usersPacket[0] as ProcedureCallPacket<
                  RowDataPacket[]
                >;
                const users: User[] = usersResult.map((userResult): User => {
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
                  if (
                    !Array.from(namespace.sockets)
                      .map(([name, value]) => ({name: name, value: value}))
                      .some(
                        (connectedSocket): boolean =>
                          connectedSocket.name === existingUser.session.socket
                      )
                  ) {
                    connection
                      .execute(
                        'CALL SP_BREEZY_UPDATE_USER (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status)',
                        {
                          userId: existingUser.id,
                          userName: existingUser.userName,
                          displayName: existingUser.displayName,
                          password: existingUser.password,
                          sessionId: existingUser.session.id,
                          socketId: null,
                          status: existingUser.session.status
                        }
                      )
                      .then((): void => {
                        connection
                          .execute(
                            'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)',
                            {userId: existingUser.id}
                          )
                          .then((offlineUserPacket): void => {
                            const [offlineUserResult] = (
                              offlineUserPacket[0] as ProcedureCallPacket<
                                RowDataPacket[]
                              >
                            )[0];
                            if (offlineUserResult) {
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
                                    status: 'offline',
                                    lastOnline: offlineUser.session.lastOnline
                                  }
                                }
                              };
                              socket.broadcast.emit(
                                'update user status',
                                userStatusNotif
                              );
                            }
                          });
                      });
                  }
                  return existingUser;
                });
                return callback(
                  createResponse({
                    event: event,
                    logger: logger,
                    data: {
                      users: users
                        .filter((user): boolean => user.id !== verifiedJwt.id)
                        .map((user): object => ({
                          id: user.id,
                          username: user.userName,
                          displayName: user.displayName,
                          session: {
                            status: user.session.status
                              .replace('appear', '')
                              .trim() as 'online' | 'away' | 'offline',
                            lastOnline: user.session.lastOnline
                          }
                        }))
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

export default fetchUsersEvent;
