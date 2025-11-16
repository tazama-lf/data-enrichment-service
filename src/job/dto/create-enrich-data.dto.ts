import { IsNotEmpty } from 'class-validator';
import { IsJsonOrArray } from '../../validators';

export class CreateEnrichDataDto {
  @IsNotEmpty()
  @IsJsonOrArray({ message: 'Data must be a JSON object or an array of JSON objects' })
  data: Record<string, unknown> | Record<string, unknown>[] = {};
}
