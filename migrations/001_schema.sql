CREATE DATABASE IF NOT EXISTS chettinad_thari CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chettinad_thari;

-- AUTH
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  status TINYINT DEFAULT 1,
  modifiedat DATETIME DEFAULT CURRENT_TIMESTAMP,
  modifiedby INT NULL
);

CREATE TABLE IF NOT EXISTS rolepermission (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  UNIQUE KEY uk_role_perm (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
);

CREATE TABLE IF NOT EXISTS sidebar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(100),
  path VARCHAR(255) NOT NULL,
  parent_permission INT NULL,
  permission INT NOT NULL,
  status TINYINT DEFAULT 1,
  UNIQUE KEY uk_sidebar_name (name),
  UNIQUE KEY uk_sidebar_icon (icon),
  UNIQUE KEY uk_sidebar_path (path)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(150),
  email VARCHAR(150),
  mobileno VARCHAR(20),
  role_id INT NOT NULL,
  status TINYINT DEFAULT 1,
  createdby INT NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedby INT NULL,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS user_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  loginAttempts INT DEFAULT 0,
  refresh_token TEXT,
  loginBlockedUntil DATETIME NULL,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS userlog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  lastlogin DATETIME,
  logout DATETIME NULL,
  FOREIGN KEY (userid) REFERENCES users(id)
);

-- MASTERS
CREATE TABLE IF NOT EXISTS gmaster (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  status TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gmastervalue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gmaster_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  status TINYINT DEFAULT 1,
  UNIQUE KEY uk_gmaster_value (gmaster_id, name),
  FOREIGN KEY (gmaster_id) REFERENCES gmaster(id)
);

CREATE TABLE IF NOT EXISTS design_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  design_code VARCHAR(100) NOT NULL UNIQUE,
  design_details TEXT,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gst (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  tax DECIMAL(5,2) NOT NULL,
  type ENUM('inclusive', 'exclusive') NOT NULL DEFAULT 'inclusive',
  status TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  parent_id INT NULL,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_category_parent_name (parent_id, name)
);

-- VENDORS
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_name VARCHAR(200) NOT NULL,
  address TEXT,
  email VARCHAR(150),
  phone VARCHAR(20),
  gst_number VARCHAR(20),
  vendor_code VARCHAR(50) NOT NULL UNIQUE,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  bill_no VARCHAR(100) NOT NULL,
  order_date DATE NOT NULL,
  no_of_packages INT DEFAULT 0,
  no_of_items INT DEFAULT 0,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(12,2) DEFAULT 0,
  status TINYINT DEFAULT 1,
  createdby INT NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vendor_bill (vendor_id, bill_no),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  vendor_order_id INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT NULL,
  createdby INT NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id)
);

-- INVENTORY
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stock_no VARCHAR(100) NOT NULL UNIQUE,
  product_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  retail_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  gst_id INT NULL,
  hsn_code VARCHAR(20) NULL,
  vendor_id INT NULL,
  design_id INT NULL,
  category_id INT NULL,
  qr_code_data TEXT,
  published TINYINT DEFAULT 1,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (gst_id) REFERENCES gst(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (design_id) REFERENCES design_master(id),
  FOREIGN KEY (category_id) REFERENCES product_categories(id)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  staff_id INT NULL,
  action_type ENUM('increase','decrease','sale','return','adjustment','bulk_upload','cancel') NOT NULL,
  quantity_changed INT NOT NULL,
  before_qty INT NOT NULL,
  after_qty INT NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(100) NULL,
  notes TEXT,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (staff_id) REFERENCES users(id)
);

-- BILLING
CREATE TABLE IF NOT EXISTS daily_reset_counter (
  id INT AUTO_INCREMENT PRIMARY KEY,
  counter_date DATE NOT NULL UNIQUE,
  counter_value_bill INT DEFAULT 0,
  counter_value_return INT DEFAULT 0,
  counter_value_trans INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing_customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(150),
  mobile VARCHAR(20),
  gst_number VARCHAR(20),
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_credit_wallet (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES billing_customers(id)
);

CREATE TABLE IF NOT EXISTS customer_credit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type ENUM('credit','debit') NOT NULL,
  bill_ref VARCHAR(100) NULL,
  notes TEXT,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES billing_customers(id)
);

CREATE TABLE IF NOT EXISTS transaction_billing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_no VARCHAR(50) NOT NULL UNIQUE,
  bill_type ENUM('sale','return') NOT NULL DEFAULT 'sale',
  parent_bill_id INT NULL,
  customer_id INT NULL,
  staff_id INT NULL,
  manual_order_number VARCHAR(100) NULL,
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  gst_total DECIMAL(12,2) DEFAULT 0,
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  credit_applied DECIMAL(12,2) DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'paid',
  cancellation_reason TEXT NULL,
  status VARCHAR(50) DEFAULT 'completed',
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_bill_id) REFERENCES transaction_billing(id),
  FOREIGN KEY (customer_id) REFERENCES billing_customers(id),
  FOREIGN KEY (staff_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  parent_transaction_id INT NULL,
  product_id INT NOT NULL,
  stock_no VARCHAR(100),
  quantity INT NOT NULL,
  returned_qty INT NOT NULL DEFAULT 0,
  cancelled_qty INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  gst_id INT NULL,
  gst_amount DECIMAL(12,2) DEFAULT 0,
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  createdby INT NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES transaction_billing(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (createdby) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS split_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  payment_method ENUM('cash','card','upi','net_banking','online','credit') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES transaction_billing(id)
);
