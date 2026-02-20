--
-- Name: matrix_activity_diffusion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS matrix_activity_diffusion (
    id integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    section_id integer NOT NULL,
    section_tipo character varying(255) NOT NULL,
    data jsonb,
    relation jsonb,
    string jsonb,
    date jsonb,
    iri jsonb,
    geo jsonb,
    number jsonb,
    media jsonb,
    misc jsonb,
    relation_search jsonb,
    meta jsonb
);


--
-- Name: matrix_activity_diffusion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS matrix_activity_diffusion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matrix_activity_diffusion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

-- ALTER SEQUENCE matrix_activity_diffusion_id_seq OWNED BY matrix_activity_diffusion.id;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relname = 'matrix_activity_diffusion_id_seq'
        AND relkind = 'S'
    ) AND EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relname = 'matrix_activity_diffusion'
        AND relkind = 'r'
    ) THEN
        ALTER SEQUENCE matrix_activity_diffusion_id_seq OWNED BY matrix_activity_diffusion.id;
    END IF;
END $$;


--
-- Name: matrix_activity_diffusion_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS matrix_activity_diffusion_section_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matrix_activity_diffusion_section_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relname = 'matrix_activity_diffusion_section_id_seq'
        AND relkind = 'S'
    ) AND EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relname = 'matrix_activity_diffusion'
        AND relkind = 'r'
    ) THEN
        ALTER SEQUENCE matrix_activity_diffusion_section_id_seq OWNED BY matrix_activity_diffusion.section_id;
    END IF;
END $$;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'matrix_activity_diffusion'
    ) THEN
        ALTER TABLE ONLY matrix_activity_diffusion ALTER COLUMN id SET DEFAULT nextval('matrix_activity_diffusion_id_seq'::regclass);
    END IF;
END $$;


--
-- Name: section_id; Type: DEFAULT; Schema: public; Owner: -
--

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'matrix_activity_diffusion'
    ) THEN
        ALTER TABLE ONLY matrix_activity_diffusion ALTER COLUMN section_id SET DEFAULT nextval('matrix_activity_diffusion_section_id_seq'::regclass);
    END IF;
END $$;


--
-- Name: matrix_activity_diffusion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'matrix_activity_diffusion'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'matrix_activity_diffusion'
        AND constraint_name = 'matrix_activity_diffusion_pkey'
    ) THEN
        ALTER TABLE ONLY matrix_activity_diffusion
            ADD CONSTRAINT matrix_activity_diffusion_pkey PRIMARY KEY (id);
    END IF;
END $$;


--
-- Indexes
--

-- section_id
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_section_id_idx ON matrix_activity_diffusion USING btree (section_id ASC NULLS LAST);
-- section_id DESC
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_section_id_desc_idx ON matrix_activity_diffusion USING btree (section_id DESC NULLS LAST);

-- section_tipo
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_section_tipo_idx ON matrix_activity_diffusion USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST);

-- section_tipo, section_id DESC
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_section_tipo_section_id_desc_idx ON matrix_activity_diffusion USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST, section_id DESC NULLS FIRST);


-- GIN Indexes

-- string
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_string_gin_idx ON matrix_activity_diffusion USING gin (string jsonb_path_ops);

-- relation
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_gin_idx ON matrix_activity_diffusion USING gin (relation jsonb_path_ops);

-- relation locators
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_locators_gin_idx ON matrix_activity_diffusion USING gin (jsonb_path_query_array(relation, '$.*[*]'::jsonpath) jsonb_path_ops);

-- relation flat st_si
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_flat_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_st_si(relation) jsonb_path_ops);

-- relation flat fct_st_si
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_flat_fct_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_fct_st_si(relation) jsonb_path_ops);

-- relation flat ty_st
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_flat_ty_st_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_ty_st(relation) jsonb_path_ops);

-- relation flat ty_st_si
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_flat_ty_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_ty_st_si(relation) jsonb_path_ops);

-- date
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_date_gin_idx ON matrix_activity_diffusion USING gin (date jsonb_path_ops);

-- iri
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_iri_gin_idx ON matrix_activity_diffusion USING gin (iri jsonb_path_ops);

-- geo
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_geo_gin_idx ON matrix_activity_diffusion USING gin (geo jsonb_path_ops);

-- number
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_number_gin_idx ON matrix_activity_diffusion USING gin (number jsonb_path_ops);

-- media
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_media_gin_idx ON matrix_activity_diffusion USING gin (media jsonb_path_ops);

-- misc
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_misc_gin_idx ON matrix_activity_diffusion USING gin (misc jsonb_path_ops);

-- relation search
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_relation_search_gin_idx ON matrix_activity_diffusion USING gin (relation_search jsonb_path_ops);

-- Timestamp
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_timestamp_idx ON matrix_activity_diffusion USING btree ("timestamp");

-- ID DESC
CREATE INDEX IF NOT EXISTS matrix_activity_diffusion_id_desc_idx ON matrix_activity_diffusion USING btree (id DESC NULLS LAST);
