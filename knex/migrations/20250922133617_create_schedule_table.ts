import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('schedule', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('cron').notNullable();
    table.integer('iterations').notNullable();
    table.enu('schedule_status', ['paused', 'active']).notNullable();
    table.string('next_time');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('schedule');
}
