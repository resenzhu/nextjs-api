import {type JwtPayload, verifyJwt} from '@utils/breezy';
import type {Namespace, Socket} from 'socket.io';
import {type Response, createResponse} from '@utils/response';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
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
              .execute(
                `SELECT DISTINCT userid, username, displayname, password, sessionid, socketid, status, lastonline, createdtime FROM breezy_users
                 WHERE TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) <= 14`,
                {
                  currentDate: DateTime.utc().toISODate()
                }
              )
              .then((packet): void => {
                const usersResult = packet[0] as RowDataPacket[];
                const users: User[] = usersResult.map((userResult): User => {
                  let user: User = {
                    id: userResult.userid,
                    userName: userResult.username,
                    displayName: userResult.displayname,
                    password: userResult.password,
                    joinDate:
                      DateTime.fromFormat(
                        userResult.createdtime,
                        'yyyy-MM-dd HH:mm:ss',
                        {zone: 'utc'}
                      ).toISO() ??
                      `${userResult.createdtime.replace(' ', 'T')}.000Z`,
                    session: {
                      id: userResult.sessionid,
                      socket: userResult.socketid,
                      status: userResult.status,
                      lastOnline:
                        DateTime.fromFormat(
                          userResult.lastonline,
                          'yyyy-MM-dd HH:mm:ss',
                          {zone: 'utc'}
                        ).toISO() ??
                        `${userResult.createdtime.replace(' ', 'T')}.000Z`
                    }
                  };
                  if (
                    !Array.from(namespace.sockets)
                      .map(([name, value]) => ({name: name, value: value}))
                      .some(
                        (connectedSocket): boolean =>
                          connectedSocket.name === user.session.socket
                      )
                  ) {
                    user = {
                      ...user,
                      session: {
                        ...user.session,
                        socket: null
                      }
                    };
                    connection
                      .execute(
                        `UPDATE breezy_users
                         SET socketid = NULL
                         WHERE userid = :userId`,
                        {
                          userId: user.id
                        }
                      )
                      .then((): void => {
                        const userStatusNotif: UserStatusNotif = {
                          user: {
                            id: user.id,
                            session: {
                              status: 'offline',
                              lastOnline: user.session.lastOnline
                            }
                          }
                        };
                        socket.broadcast.emit(
                          'update user status',
                          userStatusNotif
                        );
                      });
                  }
                  return user;
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
