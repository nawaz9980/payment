const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize table if not exists
(async () => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS deposits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chat_id VARCHAR(50),
      order_id VARCHAR(100),
      track_id VARCHAR(100),
      address VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      amount DECIMAL(18,8) DEFAULT 0,       -- requested amount (if any)
      paid_amount DECIMAL(18,8) DEFAULT 0,  -- actual paid amount confirmed
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  const conn = await pool.getConnection();
  await conn.query(createTableSQL);
  conn.release();
})();

module.exports = {
  // Save new deposit request
  saveDeposit: async (chatId, orderId, trackId, address, amount = 0) => {
    const sql = `
      INSERT INTO deposits (chat_id, order_id, track_id, address, amount) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
      chatId,
      orderId,
      trackId,
      address,
      amount,
    ]);
    return result.insertId;
  },

  // Update only status (if needed)
  updateStatus: async (trackId, status) => {
    const sql = `UPDATE deposits SET status = ? WHERE track_id = ?`;
    const [result] = await pool.query(sql, [status, trackId]);
    return result.affectedRows;
  },

  // Update status + paid amount from webhook
  updateDeposit: async (trackId, status, paidAmount) => {
    const sql = `
      UPDATE deposits 
      SET status = ?, paid_amount = ? 
      WHERE track_id = ?
    `;
    const [result] = await pool.query(sql, [status, paidAmount, trackId]);
    return result.affectedRows;
  },

  // Fetch deposit by track_id
  getDepositByTrackId: async (trackId) => {
    const sql = `SELECT * FROM deposits WHERE track_id = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [trackId]);
    return rows[0];
  },
};
