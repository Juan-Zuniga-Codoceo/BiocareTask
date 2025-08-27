// scripts/clean-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../backend/database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🧼 Iniciando limpieza de la base de datos para producción...');

const queries = [
    "DELETE FROM comments;",
    "DELETE FROM attachments;",
    "DELETE FROM task_assignments;",
    "DELETE FROM task_labels;",
    "DELETE FROM tasks;",
    "DELETE FROM labels;",
    "DELETE FROM notifications;",
    "DELETE FROM users WHERE email != 'admin@biocare.cl';",
    "VACUUM;" // Compacta la base de datos para reducir su tamaño
];

db.serialize(() => {
    db.run("PRAGMA foreign_keys = OFF;"); // Desactivamos temporalmente para evitar errores de orden
    queries.forEach(query => {
        db.run(query, function(err) {
            if (err) {
                console.error(`❌ Error ejecutando: ${query}`, err.message);
            } else {
                // Usamos this.changes para ver cuántas filas se afectaron
                console.log(`✅ Comando ejecutado: ${query.split(' ')[1]} ${query.split(' ')[2]} - Filas afectadas: ${this.changes}`);
            }
        });
    });
    db.run("PRAGMA foreign_keys = ON;"); // Reactivamos las llaves foráneas
});

db.close((err) => {
    if (err) {
        console.error('❌ Error al cerrar la base de datos', err.message);
    } else {
        console.log('\n✨ Base de datos limpia y lista para producción. Solo queda el usuario "admin".');
    }
});