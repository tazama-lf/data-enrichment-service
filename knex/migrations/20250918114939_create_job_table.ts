import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('job', (table) => {
    table.increments('id').primary();
    table.enu('sourceType', ['SFTP', 'HTTP']).notNullable();
    table.string('sourcePath').notNullable();
    table.enu('fileFormat', ['CSV', 'JSON']).notNullable();
    table.string('cronExpression').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('job');
}
