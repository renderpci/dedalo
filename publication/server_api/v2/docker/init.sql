-- Dédalo Publication API v2 - Sample Database Initialization
-- This file is automatically executed by docker-compose on first run

-- Grant read-only access
GRANT SELECT ON dedalo_web.* TO 'readonly_user'@'%';
FLUSH PRIVILEGES;

-- Sample tables (adjust to your actual schema)
CREATE TABLE IF NOT EXISTS interview (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    lang VARCHAR(10) DEFAULT 'lg-eng',
    code VARCHAR(50),
    title VARCHAR(255),
    abstract TEXT,
    transcription LONGTEXT,
    INDEX idx_section_id (section_id),
    INDEX idx_lang (lang),
    FULLTEXT idx_transcription (transcription)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audiovisual (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    lang VARCHAR(10) DEFAULT 'lg-eng',
    rsc35 VARCHAR(255),
    image VARCHAR(255),
    INDEX idx_section_id (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS informant (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    lang VARCHAR(10) DEFAULT 'lg-eng',
    name VARCHAR(255),
    surname VARCHAR(255),
    INDEX idx_section_id (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ts_themes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    term_id VARCHAR(50) NOT NULL,
    term VARCHAR(255) NOT NULL,
    scope_note TEXT,
    indexation JSON,
    parent VARCHAR(50),
    INDEX idx_term_id (term_id),
    INDEX idx_term (term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section_id INT NOT NULL,
    lang VARCHAR(10) DEFAULT 'lg-eng',
    title VARCHAR(255),
    transcription LONGTEXT,
    INDEX idx_section_id (section_id),
    FULLTEXT idx_transcription (transcription)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT INTO interview (section_id, code, title, abstract, transcription) VALUES
(1, 'OH-001', 'Interview with John Doe', 'Oral history interview about the Spanish Civil War', 'This is a sample transcription about the guerra civil española. The interview covers various aspects of daily life during the conflict.'),
(2, 'OH-002', 'Interview with Jane Smith', 'Oral history interview about post-war reconstruction', 'Another sample transcription discussing the post-war period and reconstruction efforts.');

INSERT INTO audiovisual (section_id, rsc35, image) VALUES
(1, 'av/404/rsc35_rsc167_1.mp4', 'rsc35_rsc167_1.jpg'),
(2, 'av/404/rsc35_rsc167_2.mp4', 'rsc35_rsc167_2.jpg');

INSERT INTO informant (section_id, name, surname) VALUES
(1, 'John', 'Doe'),
(2, 'Jane', 'Smith');

INSERT INTO ts_themes (term_id, term, scope_note, parent) VALUES
('ts1_1', 'Spanish Civil War', 'The Spanish Civil War (1936-1939)', NULL),
('ts1_2', 'Post-war period', 'The period following the Spanish Civil War', 'ts1_1');

INSERT INTO publications (section_id, title, transcription) VALUES
(1, 'Sample Publication', 'This is a sample publication text about economia and society. [page-n-1] The first page discusses economic conditions. [page-n-2] The second page covers social aspects.');
