import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('job');

  await knex.schema.createTable('job', (table) => {
    table.string('id').notNullable().primary();
    table.string('endpoint_name').notNullable();
    table.enu('source_type', ['SFTP', 'HTTP']).notNullable();
    table.string('description').notNullable();
    table.jsonb('connection').notNullable();
    table.jsonb('file');
    table.string('table_name').notNullable();
    table.integer('schedule_id').unsigned();
    table.enu('mode', ['append', 'replace']).notNullable().defaultTo('append');
    table.foreign('schedule_id').references('schedule.id').onDelete('CASCADE');
    table.enu('job_status', ['PENDING', 'IN-PROGRESS', 'SUSPENDED', 'CLONED']).notNullable().defaultTo('PENDING');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('job');
}
