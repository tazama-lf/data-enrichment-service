enum SourceType {
  SFTP = 'SFTP',
  HTTP = 'HTTP',
}

enum FileType {
  CSV = 'CSV',
  JSON = 'JSON',
}
enum ConfigType {
  PUSH = 'Push',
  PULL = 'Pull',
}

enum AuthType {
  USERNAME_PASSWORD = 'USERNAME_PASSWORD',
  PRIVATE_KEY = 'PRIVATE_KEY',
}

export { SourceType, FileType, AuthType, ConfigType };
