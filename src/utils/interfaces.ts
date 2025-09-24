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
  UTF8 = 'utf8',
  ASCII = 'ascii',
  LATIN1 = 'latin1',
  UTF16 = 'utf16le',
}

enum JobStatus {
  PENDING = 'PENDING',
  INPROGRESS = 'IN-PROGRESS',
  SUSPENDED = 'SUSPENDED',
  CLONED = 'CLONED',
}

enum ScheduleStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
}

export { SourceType, ScheduleStatus, FileType, AuthType, ConfigType, EncodingType, JobStatus };
