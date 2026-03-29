-- =====================================================
-- "智墨穿梭" (Zhimo Chuansuo) MySQL 数据库表结构
-- 部署位置: AutoDL GPU 服务器
-- =====================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS mengge_chuansuo 
    DEFAULT CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE mengge_chuansuo;

-- =====================================================
-- 表1: standard_trajectories
-- 存储标准蒙古文词汇的动态笔顺数据
-- =====================================================
CREATE TABLE IF NOT EXISTS standard_trajectories (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    word_id VARCHAR(64) NOT NULL UNIQUE COMMENT '词汇唯一标识符',
    text VARCHAR(255) NOT NULL COMMENT '蒙古文词汇文本',
    text_pinyin VARCHAR(255) DEFAULT NULL COMMENT '汉语拼音/音译',
    meaning VARCHAR(500) DEFAULT NULL COMMENT '中文含义',
    coordinates_json LONGTEXT NOT NULL COMMENT '笔顺坐标点JSON数组 [{x,y,t,stroke_id}, ...]',
    stroke_count INT NOT NULL DEFAULT 1 COMMENT '笔画数量',
    difficulty_level TINYINT NOT NULL DEFAULT 1 COMMENT '难度等级 1-5',
    category VARCHAR(50) DEFAULT 'basic' COMMENT '分类: basic/advanced/expert',
    image_url VARCHAR(500) DEFAULT NULL COMMENT '参考图片URL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_word_id (word_id),
    INDEX idx_difficulty (difficulty_level),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入示例标准笔顺数据
INSERT INTO standard_trajectories (word_id, text, text_pinyin, meaning, coordinates_json, stroke_count, difficulty_level, category) VALUES
('word_001', 'ᠮᠣᠩᠭᠣᠯ', 'menggu', '蒙古', 
 '[{"x":100,"y":200,"t":0,"stroke_id":1},{"x":120,"y":180,"t":50,"stroke_id":1},{"x":150,"y":150,"t":100,"stroke_id":1},{"x":180,"y":200,"t":150,"stroke_id":2},{"x":200,"y":250,"t":200,"stroke_id":2}]', 
 2, 1, 'basic'),
('word_002', 'ᠪᠣᠭᠤ', 'bogu', '老师/博古', 
 '[{"x":80,"y":150,"t":0,"stroke_id":1},{"x":100,"y":130,"t":40,"stroke_id":1},{"x":130,"y":120,"t":80,"stroke_id":1},{"x":160,"y":150,"t":120,"stroke_id":2},{"x":180,"y":200,"t":160,"stroke_id":2}]', 
 2, 2, 'basic');

-- =====================================================
-- 表2: ai_models_config
-- 存储 AI 模型版本配置
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_models_config (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    model_name VARCHAR(100) NOT NULL COMMENT '模型名称',
    model_type VARCHAR(50) NOT NULL COMMENT '模型类型: recovery/evaluate/generate',
    model_version VARCHAR(32) NOT NULL COMMENT '模型版本号',
    model_path VARCHAR(500) NOT NULL COMMENT '模型文件路径',
    config_json JSON DEFAULT NULL COMMENT '模型配置参数',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0禁用 1启用',
    accuracy FLOAT DEFAULT 0.95 COMMENT '准确率',
    avg_inference_time_ms INT DEFAULT 1000 COMMENT '平均推理时间(毫秒)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_model_type (model_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入示例模型配置
INSERT INTO ai_models_config (model_name, model_type, model_version, model_path, config_json, status, accuracy, avg_inference_time_ms) VALUES
('HandwritingRecovery_v1', 'recovery', 'v1.0.0', '/models/recovery/stable_diffusion_mongol.pt', 
 '{"resolution":512,"steps":20,"guidance_scale":7.5}', 1, 0.92, 1500),
('DTWEvaluator_v1', 'evaluate', 'v1.0.0', '/models/evaluate/dtw_scorer.pkl', 
 '{"distance_metric":"euclidean","normalization":true}', 1, 0.95, 50),
('ArtworkGenerator_v1', 'generate', 'v1.0.0', '/models/generate/sd_mongol_artwork.safetensors', 
 '{"style":"traditional_mongol","strength":0.8}', 1, 0.88, 3000);

-- =====================================================
-- 表3: evaluation_records
-- 存储用户书写评估记录 (可选，用于数据分析)
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluation_records (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    record_id VARCHAR(64) NOT NULL UNIQUE COMMENT '记录唯一标识',
    word_id VARCHAR(64) NOT NULL COMMENT '词汇ID',
    user_id VARCHAR(128) NOT NULL COMMENT '用户OpenID',
    dtw_distance FLOAT NOT NULL COMMENT 'DTW距离',
    score INT NOT NULL COMMENT '评分 0-100',
    stroke_accuracy JSON DEFAULT NULL COMMENT '各笔画准确率',
    advice TEXT DEFAULT NULL COMMENT '改进建议',
    evaluation_time_ms INT NOT NULL COMMENT '评估耗时(毫秒)',
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '评估时间',
    INDEX idx_word_id (word_id),
    INDEX idx_user_id (user_id),
    INDEX idx_evaluated_at (evaluated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
