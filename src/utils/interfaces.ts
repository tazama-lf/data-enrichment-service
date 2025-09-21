enum SourceType {
  SFTP = 'SFTP',
  HTTP = 'HTTP',
}

enum FileType {
  CSV = 'CSV',
  JSON = 'JSON',
  TSV = 'TSV',
}
enum ConfigType {
  PUSH = 'Push',
  PULL = 'Pull',
}

enum AuthType {
  USERNAME_PASSWORD = 'USERNAME_PASSWORD',
  PRIVATE_KEY = 'PRIVATE_KEY',
}

enum EncodingType {
  UTF8 = 'UTF-8',
  ASCII = 'ASCII',
  LATIN = 'Latin-1',
  UTF16 = 'UTF-16',
}

export { SourceType, FileType, AuthType, ConfigType, EncodingType };
