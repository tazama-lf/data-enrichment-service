enum SourceType {
  SFTP = 'SFTP',
  HTTP = 'HTTP',
}

enum FileType {
  CSV = 'CSV',
  JSON = 'JSON',
}

interface Job {
  id?: number;
  sourceType: SourceType;
  sourcePath: string;
  fileFormat: FileType;
  cronExpression: string;
}

class CreateJob {
  sourceType: SourceType;
  sourcePath: string;
  fileFormat: FileType;
  cronExpression: string;
}

export { SourceType, FileType, Job, CreateJob };
