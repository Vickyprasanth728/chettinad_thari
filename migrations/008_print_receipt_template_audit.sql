ALTER TABLE print_receipt_template
  ADD COLUMN createdby INT NULL AFTER value,
  ADD COLUMN createdon DATETIME DEFAULT CURRENT_TIMESTAMP AFTER createdby,
  ADD COLUMN updatedby INT NULL AFTER createdon,
  ADD COLUMN updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updatedby;

ALTER TABLE print_receipt_template
  ADD CONSTRAINT fk_receipt_template_createdby FOREIGN KEY (createdby) REFERENCES users(id),
  ADD CONSTRAINT fk_receipt_template_updatedby FOREIGN KEY (updatedby) REFERENCES users(id);
