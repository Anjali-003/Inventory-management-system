CREATE TABLE finished_goods (
    id INT AUTO_INCREMENT PRIMARY KEY,

    production_id INT NOT NULL,
    order_id INT NOT NULL,

    quantity INT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PACKAGING',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dispatched_at DATETIME NULL,
    completed_at DATETIME NULL,

    CONSTRAINT fk_finished_goods_production
        FOREIGN KEY (production_id)
        REFERENCES production_orders(id),

    CONSTRAINT fk_finished_goods_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id),

    INDEX idx_finished_goods_order (order_id),
    INDEX idx_finished_goods_status (status)
);