--
-- Name: matrix_activity_diffusion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE matrix_activity_diffusion (
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

CREATE SEQUENCE matrix_activity_diffusion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matrix_activity_diffusion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE matrix_activity_diffusion_id_seq OWNED BY matrix_activity_diffusion.id;


--
-- Name: matrix_activity_diffusion_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE matrix_activity_diffusion_section_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matrix_activity_diffusion_section_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE matrix_activity_diffusion_section_id_seq OWNED BY matrix_activity_diffusion.section_id;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY matrix_activity_diffusion ALTER COLUMN id SET DEFAULT nextval('matrix_activity_diffusion_id_seq'::regclass);


--
-- Name: section_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY matrix_activity_diffusion ALTER COLUMN section_id SET DEFAULT nextval('matrix_activity_diffusion_section_id_seq'::regclass);


--
-- Name: matrix_activity_diffusion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY matrix_activity_diffusion
    ADD CONSTRAINT matrix_activity_diffusion_pkey PRIMARY KEY (id);


--
-- Indexes
--

-- section_id
CREATE INDEX matrix_activity_diffusion_section_id_idx ON matrix_activity_diffusion USING btree (section_id ASC NULLS LAST);
-- section_id DESC
CREATE INDEX matrix_activity_diffusion_section_id_desc_idx ON matrix_activity_diffusion USING btree (section_id DESC NULLS LAST);

-- section_tipo
CREATE INDEX matrix_activity_diffusion_section_tipo_idx ON matrix_activity_diffusion USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST);

-- section_tipo, section_id DESC
CREATE INDEX matrix_activity_diffusion_section_tipo_section_id_desc_idx ON matrix_activity_diffusion USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST, section_id DESC NULLS FIRST);


-- GIN Indexes

-- string
CREATE INDEX matrix_activity_diffusion_string_gin_idx ON matrix_activity_diffusion USING gin (string jsonb_path_ops);

-- relation
CREATE INDEX matrix_activity_diffusion_relation_gin_idx ON matrix_activity_diffusion USING gin (relation jsonb_path_ops);

-- relation locators
CREATE INDEX matrix_activity_diffusion_relation_locators_gin_idx ON matrix_activity_diffusion USING gin (jsonb_path_query_array(relation, '$.*[*]'::jsonpath) jsonb_path_ops);

-- relation flat st_si
CREATE INDEX matrix_activity_diffusion_relation_flat_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_st_si(relation) jsonb_path_ops);

-- relation flat fct_st_si
CREATE INDEX matrix_activity_diffusion_relation_flat_fct_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_fct_st_si(relation) jsonb_path_ops);

-- relation flat ty_st
CREATE INDEX matrix_activity_diffusion_relation_flat_ty_st_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_ty_st(relation) jsonb_path_ops);

-- relation flat ty_st_si
CREATE INDEX matrix_activity_diffusion_relation_flat_ty_st_si_gin_idx ON matrix_activity_diffusion USING gin (data_relations_flat_ty_st_si(relation) jsonb_path_ops);

-- date
CREATE INDEX matrix_activity_diffusion_date_gin_idx ON matrix_activity_diffusion USING gin (date jsonb_path_ops);

-- iri
CREATE INDEX matrix_activity_diffusion_iri_gin_idx ON matrix_activity_diffusion USING gin (iri jsonb_path_ops);

-- geo
CREATE INDEX matrix_activity_diffusion_geo_gin_idx ON matrix_activity_diffusion USING gin (geo jsonb_path_ops);

-- number
CREATE INDEX matrix_activity_diffusion_number_gin_idx ON matrix_activity_diffusion USING gin (number jsonb_path_ops);

-- media
CREATE INDEX matrix_activity_diffusion_media_gin_idx ON matrix_activity_diffusion USING gin (media jsonb_path_ops);

-- misc
CREATE INDEX matrix_activity_diffusion_misc_gin_idx ON matrix_activity_diffusion USING gin (misc jsonb_path_ops);

-- relation search
CREATE INDEX matrix_activity_diffusion_relation_search_gin_idx ON matrix_activity_diffusion USING gin (relation_search jsonb_path_ops);

-- Timestamp
CREATE INDEX matrix_activity_diffusion_timestamp_idx ON matrix_activity_diffusion USING btree ("timestamp");

-- ID DESC
CREATE INDEX matrix_activity_diffusion_id_desc_idx ON matrix_activity_diffusion USING btree (id DESC NULLS LAST);
