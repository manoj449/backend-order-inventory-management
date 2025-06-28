import cors from "cors";
import mysql from "mysql2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
const express = require("express");


dotenv.config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "tgAoEMlzkWfbelaXItLmGCICIzvhCiGc",
  database: process.env.DB_NAME || "order_management",
  
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection error:", err);
    throw err;
  }
  console.log("MySQL connected");
});

app.post("/orders", async (req, res) => {
  const { customer_name, cart, transaction_id, payment_method } = req.body;

  // Support single order submission
  if (!cart) {
    const { product_name, quantity, price } = req.body;
    if (!customer_name || !product_name || !quantity || !price || !transaction_id || !payment_method) {
      return res.status(400).json({ error: "All fields are required for single order" });
    }
    const values = [[customer_name, product_name, quantity, price, transaction_id, payment_method]];
    const sql = `
      INSERT INTO orders 
      (customer_name, product_name, quantity, price, transaction_id, payment_method) 
      VALUES ?`;
    try {
      const [result] = await db.promise().query(sql, [values]);
      return res.json({
        message: "Order placed successfully",
        inserted: result.affectedRows,
      });
    } catch (err) {
      console.error("Insert error:", err);
      return res.status(500).json({ error: "Failed to place order: " + err.message });
    }
  }

  // Bulk order submission
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty or invalid" });
  }
  if (!customer_name || !transaction_id || !payment_method) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const values = cart.map((item) => [
    customer_name,
    item.name,
    item.quantity,
    item.price,
    transaction_id,
    payment_method,
  ]);

  const sql = `
    INSERT INTO orders 
    (customer_name, product_name, quantity, price, transaction_id, payment_method) 
    VALUES ?`;

  try {
    const [result] = await db.promise().query(sql, [values]);
    res.json({
      message: "Order placed successfully",
      inserted: result.affectedRows,
    });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ error: "Failed to place order: " + err.message });
  }
});

app.get("/orders", async (req, res) => {
  const { customer_name } = req.query;
  try {
    let query = "SELECT * FROM orders";
    let params = [];
    if (customer_name) {
      query += " WHERE customer_name = ?";
      params.push(customer_name);
    }
    const [results] = await db.promise().query(query, params);
    res.json(results);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/orders/:id", async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }
  try {
    const [result] = await db.promise().query(
      "UPDATE orders SET status = ? WHERE id = ?",
      [status, req.params.id]
    );
    res.json(result);
  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/inventory", async (req, res) => {
  try {
    const [results] = await db.promise().query("SELECT * FROM inventory");
    res.json(results);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/inventory", async (req, res) => {
  const { item_name, quantity, supplier_name, price } = req.body;
  if (!item_name || quantity == null || !supplier_name || price == null) {
    return res.status(400).json({ error: "All fields (item_name, quantity, supplier_name, price) are required" });
  }
  if (quantity < 0 || price < 0) {
    return res.status(400).json({ error: "Quantity and price must be non-negative" });
  }
  try {
    const [result] = await db.promise().query(
      "INSERT INTO inventory (item_name, quantity, supplier_name, price) VALUES (?, ?, ?, ?)",
      [item_name, quantity, supplier_name, price]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    console.error("Error adding inventory item:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/inventory/:id", async (req, res) => {
  const { item_name, quantity, supplier_name, price } = req.body;
  if (!item_name || quantity == null || !supplier_name || price == null) {
    return res.status(400).json({ error: "All fields (item_name, quantity, supplier_name, price) are required" });
  }
  if (quantity < 0 || price < 0) {
    return res.status(400).json({ error: "Quantity and price must be non-negative" });
  }
  try {
    const [existing] = await db.promise().query("SELECT * FROM inventory WHERE id = ?", [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    const [result] = await db.promise().query(
      "UPDATE inventory SET item_name = ?, quantity = ?, supplier_name = ?, price = ? WHERE id = ?",
      [item_name, quantity, supplier_name, price, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No item updated, check ID" });
    }
    res.json({ message: "Inventory updated successfully", affectedRows: result.affectedRows });
  } catch (err) {
    console.error("Error updating inventory item:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/inventory/:id", async (req, res) => {
  try {
    const [result] = await db.promise().query(
      "DELETE FROM inventory WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    res.json({ message: "Inventory item deleted", affectedRows: result.affectedRows });
  } catch (err) {
    console.error("Error deleting inventory item:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/register", async (req, res) => {
  const { username, email, password, branch, role } = req.body;
  if (!username || !email || !password || !branch || !role) {
    return res.status(400).json({ error: "All fields (username, email, password, branch, role) are required" });
  }
  if (!["Admin", "User"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Must be Admin or User" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.promise().query(
      "INSERT INTO users (username, email, password, branch, role) VALUES (?, ?, ?, ?, ?)",
      [username, email, hashedPassword, branch, role]
    );
    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Error registering user:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Username or email already exists" });
    }
    res.status(500).json({ error: "Failed to register user: " + err.message });
  }
});

app.post("/login", async (req, res) => {
  const { username, password, branch, role } = req.body;
  if (!username || !password || !branch || !role) {
    return res.status(400).json({ error: "Username, password, branch, and role are required" });
  }
  try {
    const [users] = await db.promise().query("SELECT * FROM users WHERE username = ? AND branch = ? AND role = ?", [username, branch, role]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found or incorrect branch/role" });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, branch: user.branch }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

app.post("/inventory/request", async (req, res) => {
  const { item_id, item_name, quantity, branch } = req.body;
  if (!item_id || !item_name || !quantity || !branch) {
    return res.status(400).json({ error: "All fields (item_id, item_name, quantity, branch) are required" });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be positive" });
  }
  try {
    const [result] = await db.promise().query(
      "INSERT INTO inventory_requests (item_id, item_name, quantity, branch, request_date) VALUES (?, ?, ?, ?, NOW())",
      [item_id, item_name, quantity, branch]
    );
    res.json({ message: "Request submitted successfully", id: result.insertId });
  } catch (err) {
    console.error("Error submitting request:", err);
    res.status(500).json({ error: "Failed to submit request: " + err.message });
  }
});

app.post("/inventory/transfer", async (req, res) => {
  const { item_id, item_name, quantity, from_branch, to_branch } = req.body;
  if (!item_id || !item_name || !quantity || !from_branch || !to_branch) {
    return res.status(400).json({ error: "All fields (item_id, item_name, quantity, from_branch, to_branch) are required" });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: "Quantity must be positive" });
  }
  if (from_branch === to_branch) {
    return res.status(400).json({ error: "Cannot transfer to the same branch" });
  }
  try {
    const [result] = await db.promise().query(
      "INSERT INTO inventory_transfers (item_id, item_name, quantity, from_branch, to_branch, transfer_date) VALUES (?, ?, ?, ?, ?, NOW())",
      [item_id, item_name, quantity, from_branch, to_branch]
    );
    res.json({ message: "Transfer recorded successfully", id: result.insertId });
  } catch (err) {
    console.error("Error recording transfer:", err);
    res.status(500).json({ error: "Failed to record transfer: " + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
