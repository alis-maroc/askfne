--
-- PostgreSQL database dump
--

\restrict RnagTzpEbk7aXH9gUQkMC2QuopVy2QTU4vM5FbcPPyh7ARzPwdWrH3zATDzkpUA

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ActivityLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityLog" (
    id text NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text,
    description text NOT NULL,
    "userId" text,
    "userName" text DEFAULT 'System'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "requestId" text,
    "ipAddress" text,
    "userAgent" text
);


--
-- Name: Admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Admin" (
    id text NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    name text DEFAULT 'Admin'::text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ApiKey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiKey" (
    id text NOT NULL,
    name text NOT NULL,
    key text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastUsed" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: AutomationRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationRule" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    type text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "triggerCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: BusinessHours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BusinessHours" (
    id text DEFAULT 'default'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    monday text DEFAULT '09:00-18:00'::text NOT NULL,
    tuesday text DEFAULT '09:00-18:00'::text NOT NULL,
    wednesday text DEFAULT '09:00-18:00'::text NOT NULL,
    thursday text DEFAULT '09:00-18:00'::text NOT NULL,
    friday text DEFAULT '09:00-18:00'::text NOT NULL,
    saturday text DEFAULT ''::text NOT NULL,
    sunday text DEFAULT ''::text NOT NULL,
    "offlineMessage" text DEFAULT 'We are currently offline. We will get back to you during business hours.'::text NOT NULL
);


--
-- Name: CallLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CallLog" (
    id text NOT NULL,
    "callSid" text NOT NULL,
    "from" text NOT NULL,
    "to" text NOT NULL,
    duration integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'initiated'::text NOT NULL,
    recording text,
    summary text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Campaign" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    message text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    "scheduledAt" timestamp(3) without time zone,
    "sentCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: CannedResponse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CannedResponse" (
    id text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'General'::text NOT NULL,
    shortcut text DEFAULT ''::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    icon text DEFAULT 'folder'::text NOT NULL,
    color text DEFAULT '#4A7C9B'::text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Channel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Channel" (
    id text NOT NULL,
    type text NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Conversation" (
    id text NOT NULL,
    channel text NOT NULL,
    "customerName" text DEFAULT 'Unknown'::text NOT NULL,
    "customerContact" text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    satisfaction integer,
    summary text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "customerId" text
);


--
-- Name: ConversationTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ConversationTag" (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    "tagId" text NOT NULL
);


--
-- Name: Customer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    name text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    whatsapp text DEFAULT ''::text NOT NULL,
    tags text DEFAULT ''::text NOT NULL,
    "isBlocked" boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "firstContact" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastContact" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: CustomerNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomerNote" (
    id text NOT NULL,
    "customerId" text NOT NULL,
    content text NOT NULL,
    "authorName" text DEFAULT 'Admin'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Department" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Flow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Flow" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    "startNodeId" text DEFAULT ''::text NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    "triggerCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: InternalNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InternalNote" (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    content text NOT NULL,
    "authorName" text DEFAULT 'Admin'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: KnowledgeEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KnowledgeEntry" (
    id text NOT NULL,
    "categoryId" text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: Message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Message" (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    "mediaType" text,
    "mediaUrl" text,
    "toolCalls" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SLARule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SLARule" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    channel text DEFAULT 'all'::text NOT NULL,
    priority text DEFAULT 'all'::text NOT NULL,
    "firstResponseMins" integer DEFAULT 30 NOT NULL,
    "resolutionMins" integer DEFAULT 480 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Schedule" (
    id text NOT NULL,
    "teamMemberId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL
);


--
-- Name: Settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Settings" (
    id text DEFAULT 'default'::text NOT NULL,
    "businessName" text DEFAULT 'My Business'::text NOT NULL,
    "businessDesc" text DEFAULT ''::text NOT NULL,
    "welcomeMessage" text DEFAULT 'Hello! How can I help you today?'::text NOT NULL,
    tone text DEFAULT 'friendly'::text NOT NULL,
    language text DEFAULT 'auto'::text NOT NULL,
    "aiProvider" text DEFAULT 'openai'::text NOT NULL,
    "aiModel" text DEFAULT 'gpt-4o-mini'::text NOT NULL,
    "aiApiKey" text DEFAULT ''::text NOT NULL,
    "maxTokens" integer DEFAULT 2048 NOT NULL,
    temperature double precision DEFAULT 0.7 NOT NULL,
    "elevenLabsKey" text DEFAULT ''::text NOT NULL,
    "elevenLabsVoice" text DEFAULT ''::text NOT NULL,
    "twilioSid" text DEFAULT ''::text NOT NULL,
    "twilioToken" text DEFAULT ''::text NOT NULL,
    "twilioPhone" text DEFAULT ''::text NOT NULL,
    "smtpHost" text DEFAULT ''::text NOT NULL,
    "smtpPort" integer DEFAULT 587 NOT NULL,
    "smtpUser" text DEFAULT ''::text NOT NULL,
    "smtpPass" text DEFAULT ''::text NOT NULL,
    "smtpFrom" text DEFAULT ''::text NOT NULL,
    "imapHost" text DEFAULT ''::text NOT NULL,
    "imapPort" integer DEFAULT 993 NOT NULL,
    "imapUser" text DEFAULT ''::text NOT NULL,
    "imapPass" text DEFAULT ''::text NOT NULL,
    "whatsappMode" text DEFAULT 'web'::text NOT NULL,
    "whatsappApiKey" text DEFAULT ''::text NOT NULL,
    "whatsappPhone" text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "telegramBotToken" text DEFAULT ''::text NOT NULL
);


--
-- Name: Tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tag" (
    id text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#4A7C9B'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TeamMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TeamMember" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    expertise text DEFAULT ''::text NOT NULL,
    "departmentId" text NOT NULL,
    "isAvailable" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Ticket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Ticket" (
    id text NOT NULL,
    "conversationId" text,
    "departmentId" text,
    "assignedToId" text,
    title text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    resolution text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Webhook; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Webhook" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    url text NOT NULL,
    method text DEFAULT 'POST'::text NOT NULL,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "triggerOn" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: WebhookDelivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookDelivery" (
    id text NOT NULL,
    "webhookId" text NOT NULL,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "statusCode" integer,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "nextRetryAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: ActivityLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ActivityLog" (id, action, entity, "entityId", description, "userId", "userName", metadata, "createdAt", "requestId", "ipAddress", "userAgent") FROM stdin;
\.


--
-- Data for Name: Admin; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Admin" (id, username, password, name, role, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ApiKey; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ApiKey" (id, name, key, "isActive", "lastUsed", "createdAt", "updatedAt") FROM stdin;
e296088f-646c-4c49-a52c-5c165d8ecaf1	debug	debug-key	t	\N	2026-08-25 15:49:33.963	2026-08-25 15:49:33.963
\.


--
-- Data for Name: AutomationRule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AutomationRule" (id, name, description, type, "isActive", conditions, actions, priority, "triggerCount", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: BusinessHours; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."BusinessHours" (id, enabled, timezone, monday, tuesday, wednesday, thursday, friday, saturday, sunday, "offlineMessage") FROM stdin;
\.


--
-- Data for Name: CallLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CallLog" (id, "callSid", "from", "to", duration, status, recording, summary, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Campaign; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Campaign" (id, name, description, channel, message, subject, segments, status, "scheduledAt", "sentCount", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CannedResponse; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CannedResponse" (id, title, content, category, shortcut, "isActive", "usageCount", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Category" (id, name, description, icon, color, "sortOrder", "createdAt", "updatedAt") FROM stdin;
02b66448-7c12-4407-8bf5-63f96369aa2f	مقرر السنة الدراسية 2026-2027	Routing category for school year decree queries	folder	#0EA5A4	3	2026-08-25 15:50:23.228	2026-08-25 15:50:23.228
5faea423-e3af-4c8b-b6e7-1a97fb782a12	Offices	Routing category for offices queries	folder	#4A7C9B	1	2026-08-25 15:50:23.228	2026-08-25 15:50:23.228
b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE	Routing category for legal status queries	folder	#3B82F6	2	2026-08-25 15:50:23.228	2026-08-25 15:50:23.228
91347f95-ddf2-42de-8ac1-7ebb25632e91	Offices	Routing category for offices queries	folder	#4A7C9B	1	2026-08-25 15:55:54.094	2026-08-25 15:55:54.094
68bdeff2-d80a-45ae-b45c-3233aac1a4bf	Statuts FNE	Routing category for legal status queries	book-open	#3B82F6	2	2026-08-25 15:55:54.094	2026-08-25 15:55:54.094
4620e636-e25f-47d2-ad76-eee2d2e72fd8	مقرر السنة الدراسية 2026-2027	Routing category for school year decree queries	file-text	#0EA5A4	3	2026-08-25 15:55:54.094	2026-08-25 15:55:54.094
\.


--
-- Data for Name: Channel; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Channel" (id, type, "isActive", config, status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Conversation; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Conversation" (id, channel, "customerName", "customerContact", status, satisfaction, summary, metadata, "createdAt", "updatedAt", "customerId") FROM stdin;
32b558ca-140b-4f67-98b8-a1f9e3db441f	api	API User		active	\N		{}	2026-08-25 15:49:34.564	2026-08-25 15:49:34.564	\N
c0c155a2-1459-486b-8047-4adbe58b7b47	api	API User		active	\N		{}	2026-08-25 15:56:12.097	2026-08-25 15:56:12.097	\N
\.


--
-- Data for Name: ConversationTag; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ConversationTag" (id, "conversationId", "tagId") FROM stdin;
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Customer" (id, name, email, phone, whatsapp, tags, "isBlocked", metadata, "firstContact", "lastContact", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CustomerNote; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CustomerNote" (id, "customerId", content, "authorName", "createdAt") FROM stdin;
\.


--
-- Data for Name: Department; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Department" (id, name, description, email, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Flow; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Flow" (id, name, description, "startNodeId", nodes, "isActive", "triggerCount", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: InternalNote; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InternalNote" (id, "conversationId", content, "authorName", "createdAt") FROM stdin;
\.


--
-- Data for Name: KnowledgeEntry; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."KnowledgeEntry" (id, "categoryId", title, content, priority, "isActive", version, "createdAt", "updatedAt", metadata) FROM stdin;
a3edba14-ec8e-41d8-ba98-15865185b06b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 1	Article 1\nطبقا لمقتضيات ظهير 16 يوليوز 1957 رقم (1.57.119) المتعلق بالنقابات المهنية كما تم تعديله، ولظهير 11 شتنبر 2003 بتنفيذ القانون 99-65 المتعلق بمدونة الشغل، تؤسس بين الأفراد والنقابات الموافقين والذين سيوافقون على هذا القانون الأساسي، نقابة مهنية اسمها "الجامعة الوطنية للتعليم" ("ج و ت") وتختزل في كلمة "الجامعة" ("FNE") في هذا القانون الأساسي.	120	t	1	2026-08-25 15:54:23.843	2026-08-25 15:54:23.843	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 1}
55f923df-5f91-4e79-9ace-75e9f1c6c894	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 2	Article 2\nالمقر المركزي الرئيسي لـ "الجامعة" يوجد بـ رقم 3 مكرر شارع طونكان، ديور الجامع، الرباط.\n\nالفصل الثالث: الأهداف والوسائل\n\nتهدف "الجامعة" إلى:	120	t	1	2026-08-25 15:54:23.99	2026-08-25 15:54:23.99	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 2}
329ae9f9-b281-4bfe-bcc9-300711fa6055	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 3	Article 3\nتنظيم نساء ورجال التعليم بالتربية والتعليم والتكوين الموظفين والمستخدمين والعمال والعاملات رسميين أو متدربين أو مؤقتين أو غير مدمجين، التابعين لوزارة التربية الوطنية والتعليم الأولي والرياضة ووزارة التعليم العالي والبحث العلمي والابتكار أو لأي وزارة أخرى أو للقطاع الخاص سواء كانوا مزاولين لمهامهم أو متقاعدين أو ملحقين أو موضوعين رهن الإشارة أو في حالة إيداع إداري، ودون أي تمييز من أي نوع كان.	120	t	1	2026-08-25 15:54:24.073	2026-08-25 15:54:24.073	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 3}
de2899a3-a853-4d09-96a9-c54974109d95	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 4	Article 4\nالقيام بكل عمل مشروع للدفاع عن المصالح المادية والمعنوية والمهنية للفئات المذكورة أعلاه بما فيها المفاوضات مع المصالح المركزية والجهوية والإقليمية والمحلية لإدارات وزارة التربية الوطنية والتعليم الأولي والرياضة ووزارة التعليم العالي والبحث العلمي والابتكار ومع المصالح الحكومية ومختلف الإدارات المعنية.	120	t	1	2026-08-25 15:54:24.225	2026-08-25 15:54:24.225	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 4}
4aba45ea-7fca-4137-b013-d36ee17d90b5	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 5	Article 5\nالدفاع عن تعليم عمومي مجاني وموحد لجميع بنات وأبناء شعبنا من الأولى الى العالي وعن الخدمات العامة بقطاعات وزارة التربية الوطنية والتعليم الأولي والرياضة ووزارة التعليم العالي والبحث العلمي والابتكار خاصة، وداخل قطاعات الوظيفة العمومية بشكل عام.	120	t	1	2026-08-25 15:54:24.392	2026-08-25 15:54:24.392	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 5}
263e63e3-772b-497d-8919-e3a28226a5e5	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 6	Article 6\nالعمل على تعميق الوعي النقابي والحقوقي لدى المنخرطين والمنخرطات وعموم المأجورين، نساء ورجالا، وعلى تطورهم وتقدمهم فكريا ومهنيا قصد المساهمة بشكل فعال في تحقيق التنمية وتقدم المجتمع وتحسين أوضاعهم الاقتصادية والاجتماعية والثقافية.	120	t	1	2026-08-25 15:54:24.48	2026-08-25 15:54:24.48	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 6}
98d146b5-c0db-45eb-a8f7-5913db999a42	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 7	Article 7\nالنضال من أجل تحسين مناهج وبرامج ووسائل التعليم والتكوين في أبعادها المادية والبيداغوجية، ودمقرطة حقيقية للنظام التعليمي.	120	t	1	2026-08-25 15:54:24.747	2026-08-25 15:54:24.747	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 7}
7261324f-bb69-4f0b-aedc-1c5d82888926	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 8	Article 8\nالنضال من أجل إقرار وتوسيع حقوق نساء ورجال التعليم، والحريات النقابية والديمقراطية.	120	t	1	2026-08-25 15:54:25.025	2026-08-25 15:54:25.025	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 8}
797c9f42-5573-4d60-8c95-9a3d1fa4838e	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 9	Article 9\nإنشاء مؤسسات للبحث والدراسة والتكوين والنشر هدفها معلومة والتعريف بمشاكل المنظومة التربوية والإدارة والمؤسسات والعاملين بها في أفق التقدم والتطور بما يخدم مصالح القطاع والعاملين به، ومصالح الشعب المغربي.	120	t	1	2026-08-25 15:54:25.667	2026-08-25 15:54:25.667	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 9}
9d0f0a23-e2ca-4456-a0c2-55f70bb1f00d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 10	Article 10\nإنشاء وتطوير ودمقرطة المؤسسات المرتبطة بالأعمال الاجتماعية والنظام التعاضدي ونظام التقاعد وبصفة عامة القيام بأي نشاط يؤدي إلى رفاهية وسعادة نساء ورجال التعليم والتربية والتكوين.	120	t	1	2026-08-25 15:54:25.872	2026-08-25 15:54:25.872	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 10}
5bcbe3cf-b895-4848-a4ad-456087aa3dd3	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 11	Article 11\nربط أواصر الصداقة والتعاون والتضامن والنضال مع المنظمات النقابية التعليمية المغربية والمغاربية والعربية والإفريقية والدولية.	120	t	1	2026-08-25 15:54:26.514	2026-08-25 15:54:26.514	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 11}
73f1a951-4fd8-4e95-86fb-f8c28060576c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 12	Article 12\nتأسيس روابط التضامن الدائم بين جميع أعضاء الجامعة، بغض النظر عن تخصصاتهم أو هيئاتهم أو فئاتهم، وبين كافة العاملات والعاملين بقطاع التعليم والتربية والتكوين، من أجل الدفاع المشترك عن مصالحهم والتعاون في إطار من التآزر والتضامن والتنسيق مع سائر التنظيمات النقابية لتحقيق المطالب المشتركة لكافة الأجراء والكادحين.\n\nالفصل الرابع: العضوية	120	t	1	2026-08-25 15:54:26.951	2026-08-25 15:54:26.951	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 12}
e8d41235-5fdc-4653-991a-63f401afeb4c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 13	Article 13\nيحق لكل نساء ورجال التعليم وفقا للبند الثالث من الفصل الثالث، أن ينتموا لـ "الجامعة" شريطة احترام هويتها والالتزام بمبادئها وأهدافها وقوانينها وقراراتها وتأدية واجبات الاشتراك السنوي.	120	t	1	2026-08-25 15:54:27.155	2026-08-25 15:54:27.155	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 13}
cee9445b-0a70-40f2-8056-00b2f0ed03d1	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 14	Article 14\nتضمن "الجامعة" لكافة المنخرطات والمنخرطين، ودون تمييز لأي سبب من الأسباب، الحق في التعبير والدفاع عن آرائهم المتعلقة بتنمية وتطوير النشاط النقابي ولا يمكن داخل "الجامعة" أن يتعرض أي من أعضائها للضغط أو الإساءة أو التمييز بسبب الآراء التي يدافع عنها خارج "الجامعة".	120	t	1	2026-08-25 15:54:27.227	2026-08-25 15:54:27.227	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 14}
c7b99455-c9d8-4d3b-930e-fe73d6ac6184	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 15	Article 15\nتسقط العضوية بالاستقالة أو الإقالة عند عدم تنفيذ الالتزامات أو تأدية الاشتراكات الواجبة أو الإساءة إلى "الجامعة" أو الإخلال بمبادئها، وذلك وفقا لما يحدده النظام الداخلي.\n\nالفصل الخامس: هياكل وأجهزة الجامعة\n\nتضم الهياكل التنظيمية لـ "الجامعة":	120	t	1	2026-08-25 15:54:27.353	2026-08-25 15:54:27.353	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 15}
573f10ec-d736-422f-abc4-82f4600f214f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 16	Article 16\nالهيئات الوطنية المسيرة لـ "الجامعة" والمكونة من المؤتمر الوطني والمجلس الوطني واللجنة الإدارية والمكتب الوطني.	120	t	1	2026-08-25 15:54:27.488	2026-08-25 15:54:27.488	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 16}
da54cbef-db43-4f26-970a-7f0057cb0443	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 17	Article 17\nالهياكل التنظيمية التابعة لـ "الجامعة" والمكونة من النقابات الوطنية العاملة بالتعليم ومن فروع "الجامعة" والتنظيمات الفئوية والموازية.\n\nالفصل السادس: المؤتمر الوطني	120	t	1	2026-08-25 15:54:27.608	2026-08-25 15:54:27.608	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 17}
2de5e559-bc8e-41eb-93a9-51f0efa05acb	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 18	Article 18\nالمؤتمر الوطني هو أعلى هيأة توجيهية وتقريرية بالنسبة لـ "الجامعة".	120	t	1	2026-08-25 15:54:27.657	2026-08-25 15:54:27.657	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 18}
6296cc41-02d2-460f-8e99-af8d25fc97aa	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 19	Article 19\nيُحدد المجلس الوطني لـ "الجامعة" تاريخ ومكان انعقاد المؤتمر الوطني وجدول أعماله واللجنة التحضيرية ونسبة التمثيل فيه بالنسبة لمختلف التنظيمات التابعة لـ "الجامعة".	120	t	1	2026-08-25 15:54:27.768	2026-08-25 15:54:27.768	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 19}
70cbbef1-2160-4d2c-b00e-6078badcb189	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 20	Article 20\nدورية المؤتمر: ينعقد بشكل منتظم كل أربع سنوات وبصفة استثنائية وفق قرار تتخذه اللجنة الإدارية أو المجلس الوطني بنسبة ثلثي الأعضاء الحاضرين ووفق جدول أعمال محدد وشروط يحددها النظام الداخلي.	120	t	1	2026-08-25 15:54:27.894	2026-08-25 15:54:27.894	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 20}
0b3501ec-9b55-44e4-a75c-d731ea8b3392	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 21	Article 21\nتحدد مهام المؤتمر الوطني الأساسية في:\n(أ) مناقشة التقريرين الأدبي والمالي المقدمين للمؤتمر باسم اللجنة الإدارية والبث فيهما؛\n(ب) المصادقة على التقارير والمقررات والتوصيات وعلى البيان العام وعلى تعديلات القانون الأساسي؛\n(ت) انتخاب اللجنة الإدارية الوطنية لـ "الجامعة".	120	t	1	2026-08-25 15:54:27.98	2026-08-25 15:54:27.98	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 21}
1d38cfcd-ff8e-4087-893e-dd11aa8fb897	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 22	Article 22\nلكل تنظيم مرتبط أو تابع لـ "الجامعة" الحق في أن يمثل في المؤتمر.	120	t	1	2026-08-25 15:54:28.129	2026-08-25 15:54:28.129	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 22}
90b8125a-ed71-48d1-a18a-4b8ecae51dc4	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 23	Article 23\nيشارك أعضاء اللجنة الإدارية في المؤتمر ويتمتعون بصفة مؤتمرين والأعضاء المنتخبون من طرف الفروع المحلية والإقليمية والجهوية والنقابات الوطنية والتنظيمات الموازية والفئوية وفقا لمعايير ونسب يحددها النظام الداخلي وكذا أعضاء اللجنة التحضيرية وأعضاء اللجان الثنائية الرسميين وفق ما ينص عليه النظام الداخلي.	120	t	1	2026-08-25 15:54:28.236	2026-08-25 15:54:28.236	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 23}
aea84c79-f36a-42ab-9e11-d103aaa9a99d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 24	Article 24\nيمكن إشراك عدد من الملاحظات والملاحظين في المؤتمر الوطني وفق قرار للجنة التحضيرية للمؤتمر على قاعدة شروط يحددها النظام الداخلي.	120	t	1	2026-08-25 15:54:28.33	2026-08-25 15:54:28.33	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 24}
39762de8-e237-4d31-88ae-289fd8363c4c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 25	Article 25\nيُعتبر المؤتمر الوطني قانونيا بحضور أغلبية المؤتمرات والمؤتمرين وإلا أجل لمدة لا تتجاوز شهرين ويعتبر عندها قانونيا مهما كان عدد الحاضرات والحاضرين.	120	t	1	2026-08-25 15:54:28.419	2026-08-25 15:54:28.419	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 25}
61e11c67-4d9d-4cd3-9520-b1308feae756	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 26	Article 26\nيُشكل المؤتمر من بين أعضائه لجنة لفحص العضوية، يُحدد النظام الداخلي تشكيلتها ومهامها.	120	t	1	2026-08-25 15:54:28.492	2026-08-25 15:54:28.492	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 26}
9b47f73e-dfc0-4deb-800c-b5e6ccd9fddb	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 27	Article 27\nيستمع المؤتمر الوطني للتقريرين الأدبي والمالي المقدمين من طرف المكتب الوطني باسم اللجنة الإدارية ويناقشهما ويبث فيهما بالمصادقة أو الرفض وبعد ذلك يشكل المؤتمر من بين أعضائه لجنة للرئاسة المتكونة من رئيس ومقرر ومساعد إلى أربعة مساعدين، ثم تقدم اللجنة الإدارية والمكتب الوطني استقالتهما أمام المؤتمر، وتشرف لجنة الرئاسة على باقي أشغال المؤتمر إلى حين انتخاب اللجنة الإدارية الجديدة وعقد اجتماعها الأول.	120	t	1	2026-08-25 15:54:28.602	2026-08-25 15:54:28.602	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 27}
28ed2201-3616-494b-a0bd-ba17079ca961	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 28	Article 28\nيناقش المؤتمر مشاريع التقارير والتوصيات والمقررات ويبث فيها.	120	t	1	2026-08-25 15:54:28.732	2026-08-25 15:54:28.732	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 28}
05cbc944-7fa7-46fa-8021-001455c0373e	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 29	Article 29\nيتخذ المؤتمر قراراته بالأغلبية النسبية للحاضرين والحاضرات من المؤتمرين والمؤتمرات ما عدا في القضايا التي تم التنصيص فيها على خلاف ذلك.	120	t	1	2026-08-25 15:54:28.848	2026-08-25 15:54:28.848	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 29}
be49ecb2-75d0-49fd-9904-143b431b14bd	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 30	Article 30\nينتخب المؤتمر اللجنة الإدارية، إما عن طريق الاقتراع السري المباشر، وإما عن طريق لجنة للترشيحات يشكلها المؤتمر من أجل تقديم لائحة للمترشحين/ات لعضوية اللجنة الإدارية قصد البث فيها من طرف المؤتمر.\n\nالفصل السابع: المجلس الوطني	120	t	1	2026-08-25 15:54:28.993	2026-08-25 15:54:28.993	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 30}
f95eda46-7d96-447f-aebc-642ad1140c92	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 31	Article 31\nالمجلس الوطني هو أعلى هيأة تقريرية بعد المؤتمر ويسهر بالخصوص على مراقبة تطبيق قرارات وتوجيهات وتوصيات المؤتمر وسير أجهزة "الجامعة".	120	t	1	2026-08-25 15:54:29.123	2026-08-25 15:54:29.123	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 31}
cc0a24b1-65e9-4b02-8d01-394655811e93	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 32	Article 32\nيعقد المجلس الوطني اجتماعاته، بدعوة من المكتب الوطني، مرة في السنة وكلما دعت الضرورة لذلك.	120	t	1	2026-08-25 15:54:29.268	2026-08-25 15:54:29.268	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 32}
b49b9d89-e22c-46a4-9499-254bd084afba	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 33	Article 33\nيتكون المجلس الوطني من أعضاء اللجنة الإدارية ومن الكتاب العامين وأمناء المال للفروع الإقليمية والجهوية ومن الكتاب العامين وأمناء المال أو من ينوب عنهما للأجهزة التنفيذية الوطنية للنقابات الوطنية والتنظيمات الموازية ومنسقي التنظيمات الوطنية الفئوية، وتتم تمثيلية أعضاء اللجان الثنائية وفق ما ينص عليه النظام الداخلي.	120	t	1	2026-08-25 15:54:29.422	2026-08-25 15:54:29.422	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 33}
d1d7029e-b906-4746-9cbc-ce358c07c9db	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 34	Article 34\nينعقد المجلس الوطني ويتخذ قراراته بالتوافق والتراضي بين أعضائه وإذا تعذر ذلك يتم الحسم بأغلبية الحاضرين، عند توفر النصاب القانوني المحدد في النظام الداخلي.	120	t	1	2026-08-25 15:54:29.524	2026-08-25 15:54:29.524	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 34}
53a4ecfd-11ba-4f1f-bc43-68192492d358	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 35	Article 35\nفي حالة عدم توفر النصاب القانوني المحدد في النظام الداخلي، يكتفي المجلس الوطني بإصدار توصيات لأخذها بعين الاعتبار من طرف اللجنة الإدارية والمكتب الوطني.\n\nالفصل الثامن: اللجنة الإدارية لـ "الجامعة"	120	t	1	2026-08-25 15:54:29.762	2026-08-25 15:54:29.762	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 35}
272d1aa8-4ad2-4ea7-bf56-d65e553ee697	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 67	Article 67\nالكاتب الإداري يسهر على حسن سير العمل الإداري والتوثيقي لـ "الجامعة" على المستوى المركزي.	120	t	1	2026-08-25 15:54:33.99	2026-08-25 15:54:33.99	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 67}
ab13f2a2-e63a-4bd6-8981-03760ceb3f1d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 36	Article 36\nتسير "الجامعة" من طرف اللجنة الإدارية المكونة من 121 عضوا على الأكثر - منهم نسبة للنساء يحددها النظام الداخلي - منتخبين من طرف المؤتمر الوطني الذي يحدد عدد أعضائها.	120	t	1	2026-08-25 15:54:29.932	2026-08-25 15:54:29.932	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 36}
5c0f634e-c94c-4959-8c05-f6fff23c03d5	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 37	Article 37\nتجتمع اللجنة الإدارية بصفة عادية مرتين (2) في السنة وبصفة استثنائية عند الضرورة، ويتم جمعها بدعوة من المكتب الوطني أو من ثلثي اللجنة الإدارية.	120	t	1	2026-08-25 15:54:30.197	2026-08-25 15:54:30.197	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 37}
2114cd10-6bda-407f-a04b-5431685b4a9a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 38	Article 38\nتكون الاجتماعات قانونية بحضور أغلبية الأعضاء وإلا أرجئت إلى أجل لا يتجاوز 30 يوما، ويكون الاجتماع عندئذ قانونيا مهما كان عدد الحاضرين، وتتخذ القرارات بالتوافق والتراضي وإلا بأغلبية الحاضرين.	120	t	1	2026-08-25 15:54:30.436	2026-08-25 15:54:30.436	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 38}
9cc2b667-56ac-477a-bb81-e9a0c5586525	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 39	Article 39\nكل عضو من اللجنة الإدارية تغيب عن اجتماعاتها بما فيها اجتماعات المجلس الوطني ثلاث مرات (3) بدون اعتذار مسبق أو بدون عذر مقبول من طرف اللجنة الإدارية يعتبر مستقيلا.	120	t	1	2026-08-25 15:54:30.607	2026-08-25 15:54:30.607	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 39}
98b36b68-b6dd-479b-ae5d-5e0ceff51fa2	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 40	Article 40\nفي حالة شغور منصب باللجنة الإدارية بسبب الوفاة أو الاستقالة أو الإقالة يمكن تعويضه بعضو بقرار من اللجنة الإدارية يتخذ بأغلبية أعضائها الحاضرين.	120	t	1	2026-08-25 15:54:30.797	2026-08-25 15:54:30.797	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 40}
1e092ec6-7ff9-4841-bd45-91d1c88077f5	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 41	Article 41\nتسهر اللجنة الإدارية على حسن قيادة وتسيير "الجامعة" وعلى تطبيق توجيهات ومقررات المؤتمر الوطني والمجلس الوطني لـ "الجامعة".	120	t	1	2026-08-25 15:54:31.032	2026-08-25 15:54:31.032	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 41}
13ad0ec3-ab41-4a2b-8d59-baf255f78c7f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 42	Article 42\nتقوم اللجنة بوضع نظام داخلي - يهدف تدقيق وتوضيح القانون الأساسي وضبط وتنظيم العلاقات الداخلية لـ "الجامعة".	120	t	1	2026-08-25 15:54:31.205	2026-08-25 15:54:31.205	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 42}
2372916c-3e9c-412e-8b3e-94396585995a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 43	Article 43\nتحدد نوعية الارتباط بالهيئات النقابية والمدنية على الصعيد الوطني والدولي، وتقرر في اختيار ممثلات وممثلي "الجامعة" في المؤسسات الوطنية المعنية بالتمثيلية النقابية.	120	t	1	2026-08-25 15:54:31.431	2026-08-25 15:54:31.431	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 43}
f484b727-9af6-4552-adf9-96cf3237ed48	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 44	Article 44\nتتخذ القرارات من طرف اللجنة الإدارية بالتوافق والتراضي وإلا بأغلبية الحاضرين.	120	t	1	2026-08-25 15:54:31.697	2026-08-25 15:54:31.697	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 44}
2d9df80a-f97f-46d3-94ab-5967c4f3926b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 45	Article 45\nتنتخب المكتب الوطني.	120	t	1	2026-08-25 15:54:31.777	2026-08-25 15:54:31.777	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 45}
a3d7497f-6ff3-4ada-bec6-5676f65b0934	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 46	Article 46\nتبث في التعويض عند الاقتضاء لأحد أعضاء المكتب الوطني في حالة وفاته أو استقالته أو إعفائه.	120	t	1	2026-08-25 15:54:31.857	2026-08-25 15:54:31.857	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 46}
948bbc7a-62af-4b9d-8e67-fe62d5ebd578	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 47	Article 47\nتبث في المخالفات والاختلالات التي قد يرتكبها أعضاؤها بما في ذلك أعضاء المكتب الوطني.	120	t	1	2026-08-25 15:54:31.97	2026-08-25 15:54:31.97	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 47}
2a63a0b9-976b-4741-b450-ffe20d307565	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 48	Article 48\nتنتخب من بين أعضائها لجنة للرقابة المالية، ولجنة للتحكيم ولجنة تأديبية.	120	t	1	2026-08-25 15:54:32.057	2026-08-25 15:54:32.057	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 48}
038beb19-ab7b-4b73-b673-e2bc96e83763	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 49	Article 49\nتصادق على برامج "الجامعة" للفترة ما بين مؤتمرين، للسنة وللمدة الفاصلة بين اجتماعين.	120	t	1	2026-08-25 15:54:32.139	2026-08-25 15:54:32.139	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 49}
5edfabbb-99d2-4f19-9706-f110a5c6490b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 50	Article 50\nتجمد أو تحل، إذا اقتضى الحال، الأجهزة المخلة بالتزاماتها الأساسية أو المسيئة لمبادئ وأهداف "الجامعة" وفقا لشروط يحددها النظام الداخلي.\n\nالفصل التاسع: المكتب الوطني لـ "الجامعة"	120	t	1	2026-08-25 15:54:32.293	2026-08-25 15:54:32.293	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 50}
91e0a2b0-c25c-4136-82c8-868eb31688c3	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 51	Article 51\nيُنتخب المكتب الوطني من طرف اللجنة الإدارية، ومن بين أعضائها، على ألا يتجاوز عدد أعضائه 21، منهم نسبة للنساء يحددها النظام الداخلي.	120	t	1	2026-08-25 15:54:32.432	2026-08-25 15:54:32.432	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 51}
542b69e6-97ad-46a7-ad8f-3b5d20743b54	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 52	Article 52\nينتخب المكتب الوطني من بين أعضائه الكاتب العام الوطني لـ "الجامعة" وأربعة نواب على الأكثر وأمينا للمال ونائبا له وكاتبا إداريا ونائبا له وتوزع على باقي الأعضاء مهام أخرى محددة.	120	t	1	2026-08-25 15:54:32.522	2026-08-25 15:54:32.522	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 52}
872a736c-8162-4549-b155-2c7575211b16	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 53	Article 53\nلا يحق تحمل مسؤولية الكاتب العام لـ "الجامعة" لأزيد من ولايتين متتاليتين مع تحديد الولاية في الفترة الممتدة بين مؤتمرين وطنيين.	120	t	1	2026-08-25 15:54:32.647	2026-08-25 15:54:32.647	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 53}
27344555-44e1-4d3b-b5b0-40ba6f9874e6	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 54	Article 54\nفي حالة شغور منصب بالمكتب الوطني بسبب الوفاة أو الاستقالة أو الإقالة لأحد الأعضاء يمكن للجنة الإدارية أن تنتخب من يعوضه من بين أعضائها.	120	t	1	2026-08-25 15:54:32.771	2026-08-25 15:54:32.771	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 54}
5f9f6b76-1a11-4554-b574-20f837c8c29c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 55	Article 55\nفي حالة إخلال عضو من المكتب الوطني بمسؤولياته يمكن إقالته من طرف اللجنة الإدارية بقرار يتخذ بأغلبية أعضائها الحاضرين.	120	t	1	2026-08-25 15:54:32.845	2026-08-25 15:54:32.845	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 55}
c66ff934-d34b-463c-b31a-95904f11376a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 56	Article 56\nيجتمع المكتب الوطني مرة في الشهر وكلما دعت الضرورة.	120	t	1	2026-08-25 15:54:32.924	2026-08-25 15:54:32.924	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 56}
1e267fd0-a7f3-4146-9946-d156e244127b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 57	Article 57\nالسهر على السير اليومي لـ "الجامعة" بدءا بالإشراف على حسن سير الإدارة النقابية المركزية لـ "الجامعة".	120	t	1	2026-08-25 15:54:33.035	2026-08-25 15:54:33.035	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 57}
713d0807-60d6-4164-9aa9-10995cdd2e7c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 58	Article 58\nالسهر على تطبيق القانون الأساسي والنظام الداخلي.	120	t	1	2026-08-25 15:54:33.137	2026-08-25 15:54:33.137	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 58}
20934c37-c002-48c8-87a8-aa97472e309f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 59	Article 59\nالسهر على التطبيق الخلاق لقرارات وتوصيات المؤتمر الوطني والمجلس الوطني واللجنة الإدارية.	120	t	1	2026-08-25 15:54:33.229	2026-08-25 15:54:33.229	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 59}
d64b36ff-d840-4b2c-b3a5-8bb575d51a0c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 60	Article 60\nتمثيل "الجامعة" أمام السلطات العمومية وسائر الهيئات الوطنية والدولية.	120	t	1	2026-08-25 15:54:33.32	2026-08-25 15:54:33.32	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 60}
f8d7114f-8059-45af-8277-ae82ba86b056	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 61	Article 61\nالاستعانة بعدد من الدوائر واللجان الدائمة وفرق عمل من أجل انجاز مهامه.	120	t	1	2026-08-25 15:54:33.452	2026-08-25 15:54:33.452	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 61}
3baf3556-4609-46cc-b3ab-9d8896daf4b6	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 62	Article 62\nإبرام اتفاقيات جماعية تهم القطاع أو جزءا منه، ويفوض المكتب الوطني للكاتب العام أو لعضو آخر من المكتب الوطني صلاحية توقيع الاتفاقية.	120	t	1	2026-08-25 15:54:33.506	2026-08-25 15:54:33.506	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 62}
19d69e15-fe51-4387-baae-1b56990d1c1f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 63	Article 63\nالكاتب العام هو منسق العمل الجماعي داخل المكتب الوطني ويرأس أشغاله ويشرف على حسن سيره.	120	t	1	2026-08-25 15:54:33.58	2026-08-25 15:54:33.58	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 63}
a783403a-ede5-4a99-bb1d-fc4b317a96ca	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 64	Article 64\nنواب الكاتب العام يساعدونه في مهامه وينوبون عنه عند الاقتضاء.	120	t	1	2026-08-25 15:54:33.648	2026-08-25 15:54:33.648	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 64}
da708b41-8c16-42d1-86f8-2c60dc72d1c3	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 65	Article 65\nأمين المال يسهر على حسن تدبير مالية "الجامعة" بالنسبة للموارد والمصاريف والحفاظ على وثائقه المالية؛ ولا يمكنه الصرف إلا بتوقيع مزدوج من طرفه أو نائبه مع الكاتب العام الوطني أو أحد نوابه.	120	t	1	2026-08-25 15:54:33.762	2026-08-25 15:54:33.762	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 65}
e48e6197-2464-442e-a7b7-5b4b3c6a5be4	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 66	Article 66\nنائبه يساعده في مهامه وينوب عنه عند الاقتضاء.	120	t	1	2026-08-25 15:54:33.853	2026-08-25 15:54:33.853	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 66}
724d2462-941c-4346-a3b0-e3da442ef4bf	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 68	Article 68\nأعضاء المكتب الوطني ملزمون بالإشراف على دوائر "الجامعة" واللجان الدائمة وفرق العمل بمساعدة بعض أعضاء اللجنة الإدارية.\n\nالفصل العاشر: الفروع المحلية لـ "الجامعة"	120	t	1	2026-08-25 15:54:34.134	2026-08-25 15:54:34.134	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 68}
9a814839-22dc-4481-86f3-66b34374d2e8	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 69	Article 69\nيتم تكوين الفروع المحلية لـ "الجامعة" على مستوى مناطق جغرافية محددة (جماعة قروية أو حضرية أو مركز أو قيادة أو باشوية) ويتم تحديدها من طرف المجلس الإقليمي لـ "الجامعة".	120	t	1	2026-08-25 15:54:34.241	2026-08-25 15:54:34.241	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 69}
ed593039-b43c-487d-9fd7-e4ce25964884	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 70	Article 70\nيضم الفرع المحلي لـ "الجامعة" الفروع المحلية للنقابات الوطنية وفروع التنظيمات الفئوية والموازية وكل المنخرطين بتلك المنطقة.	120	t	1	2026-08-25 15:54:34.367	2026-08-25 15:54:34.367	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 70}
a44d3f4e-b1b1-49bb-ba19-0c1130e48f27	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 71	Article 71\nالهياكل التنظيمية للفرع المحلي هي الجمع العام للفرع - المجلس المحلي للفرع - مكتب الفرع - لجان المؤسسات - المكاتب المحلية للنقابات الوطنية والتنظيمات الفئوية والموازية للمحلية.	120	t	1	2026-08-25 15:54:34.502	2026-08-25 15:54:34.502	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 71}
1676571e-08a8-49ad-b549-83e792a19442	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 72	Article 72\nالمجلس المحلي لفرع "الجامعة" هو أعلى هيئة تقريرية وتوجيهية للعمل النقابي على مستوى الفرع - في إطار مقررات وتوجيهات "الجامعة" وكذا صلاحيات تشكيل المكتب المحلي وتعويض أعضاء مكتب الفرع الذين تغيبوا ثلاث مرات متتالية دون عذر مقبول.	120	t	1	2026-08-25 15:54:34.608	2026-08-25 15:54:34.608	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 72}
49dc55d1-ce0f-4917-bee6-f94771c08f03	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 73	Article 73\nيتكون المجلس المحلي لفرع "الجامعة" من أعضاء مكتب الفرع المحلي وممثلين عن مكاتب الفروع المحلية للنقابات الوطنية والتنظيمات الموازية والفئوية المهيكلة ولجان ومناديب المؤسسات للفرع المحلي وأعضاء اللجان الإدارية الوطنية للجامعة وللنقابات الوطنية والتنظيمات الموازية وأعضاء اللجان الثنائية الرسميين والنواب.	120	t	1	2026-08-25 15:54:34.722	2026-08-25 15:54:34.722	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 73}
0651ea02-39bf-429e-80b0-a06ef28e9b93	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 74	Article 74\nالجمع العام للفرع المحلي له صلاحيات تقريرية وتعبوية ويمكنه تشكيل المكتب المحلي ويضم كل المنخرطات والمنخرطين بالفرع ويجتمع مرة في السنة وكلما دعت الضرورة.	120	t	1	2026-08-25 15:54:34.924	2026-08-25 15:54:34.924	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 74}
71e2edb7-5507-486e-9274-5134d65615e0	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 75	Article 75\nيعتبر مكتب الفرع هو الهيئة المسيرة للفرع ويتكون وفقا لما يقرره الجمع العام أو مجلس الفرع من 5 إلى 21 عضوا منتخبين تحت إشراف المكتب الإقليمي.	120	t	1	2026-08-25 15:54:35.138	2026-08-25 15:54:35.138	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 75}
21f5d7d9-fc9e-4a91-926e-f41b72fc0975	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 76	Article 76\nيسهر مكتب الفرع المحلي على تأسيس وتجديد وتنشيط وحسن تسيير لجان المؤسسات والتنظيمات الفئوية المحلية والهياكل المحلية للنقابات الوطنية والتنظيمات الموازية المحلية.	120	t	1	2026-08-25 15:54:35.338	2026-08-25 15:54:35.338	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 76}
6887389e-7139-4f4d-8653-f745230f1b12	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 77	Article 77\nيجتمع مكتب الفرع بصفة دورية على الأقل مرة في الشهر وكلما دعت الضرورة.	120	t	1	2026-08-25 15:54:35.878	2026-08-25 15:54:35.878	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 77}
bafa70c3-141d-4950-93e0-c0534727299a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 78	Article 78\nينتخب مكتب الفرع المحلي من بين أعضائه كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبا له، ويوزع على باقي الأعضاء مهام أخرى محددة.\n\nالفصل الحادي عشر: الفروع الإقليمية لـ "الجامعة"	120	t	1	2026-08-25 15:54:36.257	2026-08-25 15:54:36.257	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 78}
9c53a71c-2bae-4c1b-9e28-8638d526568a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 79	Article 79\nيتم تشكيل الفرع الإقليمي لـ "الجامعة" على مستوى الإقليم.	120	t	1	2026-08-25 15:54:36.516	2026-08-25 15:54:36.516	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 79}
02adba10-40db-43dc-b5a7-15349a9d60c3	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 80	Article 80\nالهياكل التنظيمية للفرع الإقليمي هي المؤتمر الإقليمي للفرع - والمجلس الإقليمي للفرع - الجمع العام الإقليمي للفرع - والمكتب الإقليمي للفرع - وتنظيمات النقابات الوطنية والفئوية والموازية الإقليمية.	120	t	1	2026-08-25 15:54:36.621	2026-08-25 15:54:36.621	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 80}
b4db8fa7-7c64-4c1f-9be5-f2d1bdcc98cc	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 81	Article 81\nمؤتمر الفرع هو أعلى هيئة تقريرية للفرع الإقليمي وينعقد بصفة عادية كل سنتين للاستماع إلى التقريرين الأدبي والمالي والبث فيهما والمصادقة على القرارات التوجيهية وتشكيل مكتب الفرع الإقليمي.	120	t	1	2026-08-25 15:54:36.85	2026-08-25 15:54:36.85	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 81}
19ca9686-c01b-40f1-a00f-921a4335a67b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 82	Article 82\nيشارك في مؤتمر الفرع الإقليمي مكتب الفرع الإقليمي وأعضاء مكاتب الفروع المحلية بالإقليم وعضوين عن كل فرع إقليمي أعضاء مكاتب الفروع الإقليمية للنقابات الوطنية والتنظيمات الموازية وأعضاء اللجنة الإدارية الوطنية لـ "الجامعة" وللنقابات الوطنية والتنظيمات الموازية بالإقليم، وأعضاء اللجان الثنائية بالإقليم ومنسقي التنظيمات الفئوية الإقليمية، وأعضاء آخرين منتخبين من طرف الفروع المحلية.	120	t	1	2026-08-25 15:54:37.017	2026-08-25 15:54:37.017	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 82}
0948d88b-078f-43c4-9a9a-26aa985d6b1b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 83	Article 83\nالمجلس الإقليمي هو أعلى هيئة تنظيمية بعد مؤتمر الفرع الإقليمي وله صلاحيات تشكيل المكتب الإقليمي والتوجيه والتقرير في العمل النقابي على مستوى الإقليم - في إطار مقررات وتوجيهات "الجامعة"، وينعقد بصفة عادية مرتين في السنة وكلما دعت الضرورة إلى ذلك.	120	t	1	2026-08-25 15:54:37.217	2026-08-25 15:54:37.217	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 83}
58719e8f-17f6-4284-82b0-04a317938306	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 84	Article 84\nيتكون المجلس الإقليمي لفرع "الجامعة" من أعضاء المكتب الإقليمي ومكاتب الفروع المحلية بالإقليم وكاتب عام وأمين مال أو من ينوب عنهما لكل مكتب إقليمي للنقابات الوطنية والتنظيمات الموازية وأعضاء اللجنة الإدارية الوطنية لـ "الجامعة" وللنقابات الوطنية والتنظيمات الموازية بالإقليم وأعضاء المكتب الجهوي المتواجدين بالإقليم، وأعضاء اللجان الثنائية بالإقليم ومنسقي التنظيمات الفئوية الإقليمية.	120	t	1	2026-08-25 15:54:37.38	2026-08-25 15:54:37.38	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 84}
1097851a-aa0c-4752-94df-637c202df0b2	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 85	Article 85\nللمجلس الإقليمي صلاحيات تغيير أعضاء مكتب الفرع الإقليمي الذين تغيبوا ثلاث مرات متتالية دون عذر مقبول.	120	t	1	2026-08-25 15:54:37.514	2026-08-25 15:54:37.514	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 85}
38394ed0-d868-47e0-9baa-7c417b7a6c08	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 86	Article 86\nمكتب الفرع الإقليمي هو الهيئة المسيرة للفرع ويتكون من 7 إلى 21 عضوا منتخبين من طرف مؤتمر أو مجلس الفرع تحت إشراف المكتب الجهوي بتنسيق مع المكتب الوطني.	120	t	1	2026-08-25 15:54:37.683	2026-08-25 15:54:37.683	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 86}
ff135c00-1b11-4e1b-88a8-fc8be3d07b37	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 87	Article 87\nيتكون مكتب الفرع الإقليمي من ممثل (ة) أو أكثر عن كل فرع محلي ومن أعضاء آخرين منتخبين من طرف المجلس أو المؤتمر الإقليمي.	120	t	1	2026-08-25 15:54:37.805	2026-08-25 15:54:37.805	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 87}
a1f5d9e8-ef5b-4f19-a7b1-8ca689efa70a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 88	Article 88\nإذا كان بالإقليم فرع محلي واحد فإنه يعتبر فرعا إقليميا.	120	t	1	2026-08-25 15:54:37.924	2026-08-25 15:54:37.924	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 88}
f7e070d4-7218-45db-b037-4f0466e1fe68	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 89	Article 89\nيمكن إذا دعت الضرورة عقد مؤتمر فوق العادة للفرع الإقليمي له صلاحيات المؤتمر العادي.	120	t	1	2026-08-25 15:54:38.067	2026-08-25 15:54:38.067	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 89}
0c61c6ef-c0d9-4f6b-81ac-0e69382ad268	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 90	Article 90\nينتخب مكتب الفرع الإقليمي من بين أعضائه كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبه، ويوزع على باقي الأعضاء مهاما أخرى محددة.	120	t	1	2026-08-25 15:54:38.158	2026-08-25 15:54:38.158	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 90}
93d9e7c2-05dc-4ea1-a15e-d91293238837	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 91	Article 91\nيسهر مكتب الفرع الإقليمي على تأسيس وتجديد وتنشيط وحسن تسيير الفروع المحلية بالإقليم والتنظيمات الإقليمية للنقابات الوطنية والتنظيمات الموازية الإقليمية والتنظيمات الفئوية الإقليمية ولجان المؤسسات بالإقليم.	120	t	1	2026-08-25 15:54:38.302	2026-08-25 15:54:38.302	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 91}
e962ec66-3d67-405b-888b-eee5864b0e5f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 92	Article 92\nيجتمع مكتب الفرع الإقليمي بصفة دورية على الأقل مرة في شهرين وكلما دعت الضرورة.\n\nالفصل الثاني عشر: الفروع الجهوية لـ "الجامعة"	120	t	1	2026-08-25 15:54:38.399	2026-08-25 15:54:38.399	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 92}
c9539409-3ff9-47a9-aa4a-565d118c89cb	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 93	Article 93\nيتم تشكيل فروع جهوية لـ "الجامعة" على مستوى الجهات الإدارية المعمول بها.	120	t	1	2026-08-25 15:54:38.454	2026-08-25 15:54:38.454	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 93}
970bafdd-3172-4a3f-ad3d-33b53f7146eb	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 94	Article 94\nالهياكل التنظيمية للفرع الجهوي هي المؤتمر الجهوي للفرع - المجلس الجهوي للفرع - والمكتب الجهوي للفرع - التنظيمات النقابات الوطنية والموازية الجهوية والتنظيمات الفئوية الجهوية.	120	t	1	2026-08-25 15:54:38.593	2026-08-25 15:54:38.593	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 94}
dfbfb859-9e60-48da-95ba-4145284756a1	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 95	Article 95\nالمؤتمر الجهوي يتكون من ممثلي الفروع المحلية حسب عدد البطاقات المسواة وأعضاء مكاتب الفروع الإقليمية لـ "الجامعة" ومكتب الفرع الجهوي وأعضاء مكاتب الفروع الإقليمية والجهوية للنقابات الوطنية والتنظيمات الموازية بالإضافة الى عضوين لكل فرع جهوي لهذه النقابات والتنظيمات وأعضاء اللجنة الإدارية الوطنية لـ "الجامعة" وللنقابات الوطنية وللتنظيمات الموازية بالجهة، وأعضاء اللجان الثنائية بالجهة ومنسقي التنظيمات الفئوية الجهوية.	120	t	1	2026-08-25 15:54:38.702	2026-08-25 15:54:38.702	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 95}
503e6b23-83bf-41fd-9be8-48105fda69c2	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 96	Article 96\nيتكون المجلس الجهوي من أعضاء مكتب الفرع الجهوي ومكاتب الفروع الإقليمية لـ "الجامعة" وكتاب وأمناء مال الفروع المحلية أو من ينوب عنهم وكاتب عام وأمين مال لكل مكتب جهوي أو من ينوب عنهما للأجهزة التنفيذية الإقليمية والجهوية للنقابات الوطنية والتنظيمات الموازية وأعضاء اللجنة الإدارية الوطنية لـ "الجامعة" وللنقابات الوطنية وللتنظيمات الموازية بالجهة، وأعضاء اللجان الثنائية بالجهة ومنسقي التنظيمات الفئوية الجهوية.	120	t	1	2026-08-25 15:54:38.771	2026-08-25 15:54:38.771	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 96}
e091eeb3-257f-4781-ad8a-dc0dbcdc1702	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 97	Article 97\nالمجلس الجهوي هو أعلى هيئة تقريرية بعد مؤتمر الفرع الجهوي وله صلاحيات التوجيه والتقرير في العمل النقابي على مستوى الجهة - في إطار مقررات وتوجيهات "الجامعة"، ويقرر في عقد مؤتمر جهوي أو مجلس جهوي لتجديد المكتب الجهوي.	120	t	1	2026-08-25 15:54:38.863	2026-08-25 15:54:38.863	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 97}
74040db1-924b-4460-b24e-4dbf820c2cdc	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 98	Article 98\nللمجلس الجهوي صلاحيات تشكيل المكتب الجهوي وتعويض أعضائه الذين تغيبوا ثلاث مرات متتالية دون عذر مقبول. ينتخب مكتب الفرع الجهوي من بين أعضائه كاتبا عاما ونائبه أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبه. ويتم تجديد مكتب الفرع الجهوي كل ثلاث سنوات.	120	t	1	2026-08-25 15:54:38.938	2026-08-25 15:54:38.938	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 98}
4ace9558-ff15-4a3c-83b0-ff9ecfbb9b3d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 99	Article 99\nالمؤتمر هو أعلى هيئة تقريرية للفرع الجهوي وينعقد بصفة عادية مرة على الأقل ثلاث سنوات للاستماع إلى التقريرين الأدبي والمالي والبث فيهما والمصادقة على القرارات التوجيهية وتشكيل مكتب الفرع الجهوي.	120	t	1	2026-08-25 15:54:39.006	2026-08-25 15:54:39.006	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 99}
562bf11d-91d2-45e7-ab65-aa1df36c219d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 100	Article 100\nمكتب الفرع الجهوي هو الهيئة المسيرة الدائمة للفرع ويتكون من 7 إلى 27 عضوا منتخبين من طرف المؤتمر أو المجلس الجهوي تحت إشراف المكتب الوطني أو من ينتدبه لذلك من أعضاء اللجنة الإدارية.	120	t	1	2026-08-25 15:54:39.104	2026-08-25 15:54:39.104	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 100}
3066d298-6594-45cf-a2e5-244e21ec3d42	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 101	Article 101\nيتكون مكتب الفرع الجهوي من ممثل (ة) أو أكثر عن كل فرع إقليمي ويمكن إضافة أعضاء آخرين منتخبين من طرف المؤتمر أو المجلس الجهوي.	120	t	1	2026-08-25 15:54:39.188	2026-08-25 15:54:39.188	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 101}
1ccca9c9-341b-4655-b917-93305e276607	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 102	Article 102\nيمكن إذا دعت الضرورة عقد مؤتمر فوق العادة للفرع الجهوي له صلاحيات المؤتمر العادي.	120	t	1	2026-08-25 15:54:39.245	2026-08-25 15:54:39.245	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 102}
4af3d40e-de7f-4425-b490-b2af5a5930a8	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 103	Article 103\nينتخب مكتب الفرع الجهوي من بين أعضائه كاتبا عاما وأربعة نواب على الأكثر له وأمينا للمال ونائبه وكاتبا إداريا ونائبه، ويوزع على باقي الأعضاء مهاما أخرى محددة.	120	t	1	2026-08-25 15:54:39.361	2026-08-25 15:54:39.361	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 103}
099b6991-f0e8-4786-9789-dffed3ad87e6	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 104	Article 104\nيسهر مكتب الفرع الجهوي على تأسيس وتجديد الفروع الإقليمية لـ "الجامعة" بالجهة والتنظيمات الفئوية الجهوية والتنظيمات الجهوية للنقابات الوطنية والتنظيمات الموازية الجهوية بالتنسيق مع المكاتب الإقليمية والمكتب الوطني، وكذا على تنشيطها وحسن تسييرها.	120	t	1	2026-08-25 15:54:39.463	2026-08-25 15:54:39.463	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 104}
0572d29a-0cd8-48bb-b18b-572936af03c0	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 105	Article 105\nيجتمع مكتب الفرع الجهوي بصفة دورية مرة كل شهرين وكلما دعت الضرورة.\n\nالفصل الثالث عشر: النقابات الوطنية	120	t	1	2026-08-25 15:54:39.521	2026-08-25 15:54:39.521	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 105}
453e5f73-e6e0-4699-9625-c5de16d87b0c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 106	Article 106\nيمكن تكوين نقابة وطنية أو أكثر في إطار "الجامعة" على غرار "النقابة الوطنية للعاملين بالتعليم العالي" أو "النقابة الوطنية للمبرزين" ويخضع تشكيل النقابة الوطنية لمقتضيات القانون الأساسي لـ "الجامعة" ويتم تحت إشرافها.	120	t	1	2026-08-25 15:54:39.629	2026-08-25 15:54:39.629	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 106}
cdc67b68-2e0d-40bf-a0a1-9807993d1cf0	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 107	Article 107\nهياكل النقابة الوطنية هي المؤتمر الوطني والمجلس الوطني والمكتب الوطني والفروع الجهوية والإقليمية والمحلية والكتابة التنفيذية إذا دعت الضرورة.	120	t	1	2026-08-25 15:54:39.754	2026-08-25 15:54:39.754	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 107}
0e180f87-1566-4d17-b2a6-73b6afd9d7dc	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 108	Article 108\nيتم تنظيم المؤتمرات الوطنية للنقابات الوطنية بعد إشعار المكتب الوطني، شهرا على الأقل قبل انعقاد المؤتمر؛ ويتم ذلك تحت إشراف ممثل المكتب الوطني.	120	t	1	2026-08-25 15:54:39.813	2026-08-25 15:54:39.813	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 108}
36cceacf-8a85-4409-b034-bceadf109b72	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 109	Article 109\nالمؤتمر الوطني ينعقد بشكل عادي مرة كل أربع سنوات وبشكل استثنائي كل ما دعت الضرورة إلى ذلك، بقرار من ثلثي أعضاء المجلس الوطني، ويشارك في المؤتمر الوطني عضوات وأعضاء المجلس الوطني بالإضافة إلى منتدبين عن الفروع غير المهيكلة وفق ما يحدده القانون الداخلي للجامعة. وينتخب المؤتمر الوطني مكتبا وطنيا من بين أعضائه مكونا من 9 إلى 21 عضوا.	120	t	1	2026-08-25 15:54:40.025	2026-08-25 15:54:40.025	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 109}
29894631-e557-41f8-a560-0f5e94d1f43d	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 110	Article 110\nالمجلس الوطني هو أعلى هيأة تقريرية للنقابة الوطنية بعد المؤتمر الوطني، ويجتمع بدعوة من المكتب الوطني بصفة عادية مرتين في السنة وبصفة استثنائية كل ما دعت الضرورة إلى ذلك. وهو الهيأة المسؤولة عن قيادة وتسيير النقابة الوطنية في إطار اختيارات المؤتمر الوطني وله صلاحية التقرير والمراقبة والتوجيه ويقوم بتعويض أعضاء المكتب الوطني الذين تخلوا عن مهامهم لسبب من الأسباب.	120	t	1	2026-08-25 15:54:40.202	2026-08-25 15:54:40.202	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 110}
4bf48f63-fb7b-4482-b358-ef93ed39b489	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 111	Article 111\nيتكون المجلس الوطني من أعضاء المكتب الوطني ومن أعضاء المكاتب الجهوية ومن الكتاب العامين وأمناء المال الفروع الإقليمية والمحلية وأعضاء اللجن الثنائية.	120	t	1	2026-08-25 15:54:40.315	2026-08-25 15:54:40.315	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 111}
44c922b8-8245-4f8b-a529-dc1abb7dc3ab	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 112	Article 112\nينتخب المكتب الوطني من بين أعضائه، كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبه يجتمع المكتب الوطني أربع مرات على الأقل في السنة.	120	t	1	2026-08-25 15:54:40.446	2026-08-25 15:54:40.446	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 112}
02174334-78fb-4f55-80d5-72a15ef7d711	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 113	Article 113\nتشكل فروع محلية وإقليمية وجهوية للنقابة الوطنية على مستوى مناطق يحددها المكتب الوطني، وتسير الفروع المحلية والإقليمية والجهوية من طرف مكاتب للفروع مكونة من 5 إلى 21 عضوا، وينتخب مكتب الفرع من بين أعضائه كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبا له وكاتبا إداريا ونائبه.\n\nالفصل الرابع عشر: التنظيمات الفئوية المرتبطة بـ "الجامعة"	120	t	1	2026-08-25 15:54:40.709	2026-08-25 15:54:40.709	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 113}
027e8e76-0437-4189-a7a0-0883a463ada2	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 114	Article 114\nترتبط بـ "الجامعة" تنظيمات فئوية وطنية أو جهوية أو إقليمية أو محلية هدفها تأطير دائم لفئة مكونة من هيئة أو إطار مهني متجانس أو تأطير ظرفي لأطر أو هيئات مختلفة لكن لها مطالب مشتركة خصوصية.	120	t	1	2026-08-25 15:54:40.888	2026-08-25 15:54:40.888	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 114}
a59886c5-0de6-4cfa-b9c4-b688eb0ef8a9	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 115	Article 115\nتتكون هياكل كل تنظيم فئوي وطني من:\n(أ) الملتقى الوطني الذي يجتمع مرة كل سنة وكلما دعت الضرورة إلى ذلك؛\n(ب) اللجنة الوطنية؛\n(ت) الكتابة الوطنية للتنظيم الفئوي التي تنتخب من بين أعضائها كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبه؛\n(ث) التنظيمات المحلية والإقليمية والجهوية للتنظيم الفئوي والتي يتم تسييرها من طرف لجنة محلية أو إقليمية أو جهوية تنتخب من بين أعضائها كاتبا عاما ونائبا أو نوابا له وأمينا للمال ونائبه وكاتبا إداريا ونائبه؛\n(ج) يضع الملتقى الوطني لكل تنظيم فئوي نظاما داخليا مكملا لهذا الفصل من القانون الأساسي، يتم المصادقة عليه أو تعديله بالأغلبية المطلقة للمشاركين في الملتقى.\n\nالفصل الخامس عشر: التنظيمات الموازية\n\nالتنظيمات الموازية المرتبطة بـ "الجامعة" هدفها توسيع وتعميق العمل النقابي بتأطير شرائح محددة من منخرطي الجامعة وتعبئتهم انطلاقا من خصوصياتهم وهي:	120	t	1	2026-08-25 15:54:41.088	2026-08-25 15:54:41.088	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 115}
140778f1-0dd4-4374-b152-24eb7f98e3c5	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 116	Article 116\nجمعية "إتحاد نساء التعليم بالمغرب" UFEM	120	t	1	2026-08-25 15:54:41.201	2026-08-25 15:54:41.201	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 116}
169098e4-c4f1-4a28-994a-cc165e9a3b14	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 117	Article 117\nجمعية "إتحاد متقاعدي التعليم بالمغرب" UREM	120	t	1	2026-08-25 15:54:41.371	2026-08-25 15:54:41.371	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 117}
abc9c827-3491-495c-81d4-a0f989d3f918	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 118	Article 118\nجمعية "إتحاد شباب التعليم بالمغرب" JEM\n\nالفصل السادس عشر: الحصيص النسائي والشبيبي	120	t	1	2026-08-25 15:54:41.551	2026-08-25 15:54:41.551	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 118}
126934bf-bfcd-43f0-89b5-12864fdfe382	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 119	Article 119\nتعمل "الجامعة" تدريجيا على تفعيل شعار "الثلث على الأقل في أفق المناصفة"، مع تحديد النظام الداخلي لحصيص نسائي موجب للتطبيق وفق جدولة زمنية محددة.	120	t	1	2026-08-25 15:54:41.61	2026-08-25 15:54:41.61	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 119}
2ddda00c-e8d2-41a7-8d6c-fe0e6095cb05	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 120	Article 120\nيتم في إطار النظام الداخلي تحديد حصيص خاص بالشباب على مستوى كافة الأجهزة المذكورة في الفقرة السابقة.\n\nالفصل السابع عشر: الإدارة النقابية	120	t	1	2026-08-25 15:54:41.673	2026-08-25 15:54:41.673	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 120}
05c5a98e-a3e9-482b-b093-d8eedfae3faf	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 121	Article 121\nتعتمد "الجامعة" على إدارات نقابية تتكون من متفرغين للعمل النقابي وموضوعين رهن الإشارة، ومن متطوعين للعمل النقابي.	120	t	1	2026-08-25 15:54:41.759	2026-08-25 15:54:41.759	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 121}
d9b8a6c3-95e4-47ca-9b49-1d0f92b5d004	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 122	Article 122\nتشتغل الإدارات النقابية لـ "الجامعة" تحت الإشراف المباشر للأجهزة التنفيذية لـ "الجامعة" والتنظيمات الوطنية وللفروع المحلية والإقليمية والجهوية.\n\nالفصل الثامن عشر: العلاقات الوطنية للجامعة	120	t	1	2026-08-25 15:54:41.848	2026-08-25 15:54:41.848	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 122}
ee00124a-adc0-4729-b59f-a9913c8fa9a3	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 123	Article 123\nتعمل "الجامعة" وطنيا وقطاعيا ومحليا وإقليميا وجهويا على توطيد أواصر التضامن والتعاون مع سائر القوى الديمقراطية - النقابية والسياسية والاجتماعية والحقوقية والنسائية والشبيبية والجمعوية - التي لها نفس الأهداف بما لا يتنافى وهوية ومبادئ "الجامعة".	120	t	1	2026-08-25 15:54:41.923	2026-08-25 15:54:41.923	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 123}
3485974b-8c5a-4581-9322-3d2f6ab2e71a	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 124	Article 124\nتسهر "الجامعة" على تطوير حجم وفعل تمثيليتها في مختلف المؤسسات الوطنية والجهوية خدمة للتعليم العمومي والمصالح نساء ورجال التعليم والطبقة العاملة.\n\nالفصل التاسع عشر: العلاقات الدولية للجامعة	120	t	1	2026-08-25 15:54:42.003	2026-08-25 15:54:42.003	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 124}
21b485c3-bee9-43b9-9197-5ebc35f0be05	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 125	Article 125\nتنخرط "الجامعة" في التكتلات النقابية التعليمية على المستوى المغاربي والعربي والإفريقي والدولي لها نفس الأهداف وبما لا يتنافى وهوية ومبادئ "الجامعة".	120	t	1	2026-08-25 15:54:42.075	2026-08-25 15:54:42.075	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 125}
b7f53df8-9918-4d95-a26a-df8f372be8b6	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 126	Article 126\nتعمل "الجامعة" مع سائر القوى التحررية والتقدمية في العالم من أجل التصدي للعولمة الليبرالية المتوحشة وللهيمنة الامبريالية ومن أجل مناصرة الشعوب في نضالها من أجل التحرر الوطني والاجتماعي ومن أجل مناهضة التطبيع والصهيونية.\n\nالفصل العشرون: مالية "الجامعة"	120	t	1	2026-08-25 15:54:42.103	2026-08-25 15:54:42.103	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 126}
cc814991-edd2-423c-925d-1fd0470a7931	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 127	Article 127\nتستمد "الجامعة" مداخيلها من انخراطات واشتراكات واكتتابات الأعضاء ومن الهبات والوصايا والتبرعات النقدية والعينية والإعانات ومداخيل الأنشطة وكافة المداخيل المسموح بها قانونيا والتي لا يتعارض قبولها مع هوية ومبادئ "الجامعة" وأهدافها.	120	t	1	2026-08-25 15:54:42.224	2026-08-25 15:54:42.224	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 127}
b11f881f-7677-4cfc-9d92-e9346cd3dbac	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 128	Article 128\nالمكتب الوطني مؤتمن على مالية وممتلكات "الجامعة" ويحرص على صيانتها وحمايتها.	120	t	1	2026-08-25 15:54:42.304	2026-08-25 15:54:42.304	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 128}
8eca9bb5-1fe7-464d-adff-2238efbf5958	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 129	Article 129\nيودع رصيد "الجامعة" في حساب بنكي باسم "الجامعة الوطنية للتعليم".	120	t	1	2026-08-25 15:54:42.383	2026-08-25 15:54:42.383	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 129}
c12961d1-2f30-402b-9d65-6cedbc6ed15b	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 130	Article 130\nالسحب البنكي يتم بواسطة شيك بتوقيع مزدوج من طرف الكاتب العام الوطني أو أحد نوابه وأمين المال أو نائبه.	120	t	1	2026-08-25 15:54:42.448	2026-08-25 15:54:42.448	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 130}
0eb53207-69a5-4faf-a80d-8e3bd4ed68ea	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 131	Article 131\nتحدد اللجنة الإدارية النسب الموزعة من قيمة الانخراط على مختلف هياكل "الجامعة".	120	t	1	2026-08-25 15:54:42.529	2026-08-25 15:54:42.529	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 131}
907fc08d-6a46-470a-8f0c-8eaf8a888484	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 132	Article 132\nيقوم أمين المال أو نائبه بتحصيل المداخيل وضبط وثائق المحاسبة وجرد ممتلكات "الجامعة" ويقدم تقارير مالية للهياكل التنظيمية المعنية.	120	t	1	2026-08-25 15:54:42.592	2026-08-25 15:54:42.592	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 132}
93effdb2-d7fa-4d3a-9ca9-e6ad7578455c	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 133	Article 133\nالمرجع الوحيد في تحديد عدد المنخرطين هو المبالغ المالية المسددة برسم واجب الانخراط وفق ما ينص عليه القانون الداخلي.	120	t	1	2026-08-25 15:54:42.666	2026-08-25 15:54:42.666	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 133}
81b24c9d-4315-466d-9e97-4f5b322dc802	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 134	Article 134\nتشكل لجنة للمراقبة المالية من 5 أعضاء من بين أعضاء اللجنة الإدارية الوطنية وتسهر على حسن تدبير مالية "الجامعة".\n\nالفصل الواحد والعشرون: النزاعات الداخلية	120	t	1	2026-08-25 15:54:42.757	2026-08-25 15:54:42.757	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 134}
9b154290-3ef3-4f60-bb87-fa6f48155e3f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 135	Article 135\nعند نشوب نزاعات داخل "الجامعة" بين أجهزة نقابية مختلفة، أو بين مسؤولين نقابيين، أو بين مسؤولين وأجهزة، يتم اللجوء إلى الضوابط التنظيمية المحددة في القانون الأساسي والنظام الداخلي؛ وعند اختلاف التأويل يمكن اللجوء إلى أسلوب التحكيم المخول للجنة التحكيم الوطنية.	120	t	1	2026-08-25 15:54:42.833	2026-08-25 15:54:42.833	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 135}
e8450cde-5461-4a0e-9a60-a37dc7af6429	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 136	Article 136\nفي حالة عدم نجاح التحكيم يطرح النزاع على المجلس الوطني ليبث فيه.\n\nالفصل الثاني والعشرون: الإجراءات التأديبية	120	t	1	2026-08-25 15:54:42.9	2026-08-25 15:54:42.9	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 136}
bf3a8494-bcd0-4e40-bfd2-8dc4c5b69be1	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 137	Article 137\nتبث اللجنة الإدارية في النزاعات الداخلية في "الجامعة" وتتخذ الإجراءات التأديبية المناسبة.	120	t	1	2026-08-25 15:54:42.982	2026-08-25 15:54:42.982	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 137}
bd3ee2bf-0d01-46bd-8f30-2a70a0000726	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 138	Article 138\nيحق لمختلف الأجهزة القيادية والتنفيذية للجامعة، وطنيا وقطاعيا ومحليا وإقليميا وجهويا، اتخاذ إجراءات تأديبية معللة في حق كل عضو.	120	t	1	2026-08-25 15:54:43.04	2026-08-25 15:54:43.04	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 138}
391cb955-26c6-401b-8bb5-672ec9c65c53	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 139	Article 139\nتتراوح الإجراءات التأديبية بين الإنذار والإقالة من المهام والتوقيف المؤقت والطرد من "الجامعة" بالنسبة للعضو، وبين الإنذار والتجميد والحل بالنسبة للجهاز؛ ولا يحق اتخاذ الإجراءات القصوى بالخصوص، إلا بعد الإنصات للمعنيين بالأمر ومن حق اللجنة الإدارية لـ "الجامعة" مراجعة قرار فصل العضو أو حل الجهاز.	120	t	1	2026-08-25 15:54:43.103	2026-08-25 15:54:43.103	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 139}
e7806405-bd1e-4130-aeaf-19c814675899	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 140	Article 140\nوتأكيد قرار الفصل من لدن اللجنة الإدارية لـ "الجامعة".	120	t	1	2026-08-25 15:54:43.186	2026-08-25 15:54:43.186	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 140}
237cf87c-0275-4193-be61-2f616783dff2	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 141	Article 141\nيدقق النظام الداخلي في كل ما يتعلق بالإجراءات التأديبية وفي شروط الطعن فيها.\n\nالفصل الثالث والعشرون: مقتضيات خاصة	120	t	1	2026-08-25 15:54:43.416	2026-08-25 15:54:43.416	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 141}
cc506cdd-348f-4161-8c8d-f0d3d87cc089	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 142	Article 142\nيمكن تعديل القانون الأساسي بقرار من المؤتمر العادي أو الاستثنائي، يتخذ بالأغلبية المطلقة للحاضرين.	120	t	1	2026-08-25 15:54:43.524	2026-08-25 15:54:43.524	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 142}
e77cc484-92e1-467e-a0bc-1abf5a53e1fa	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 143	Article 143\nتضع اللجنة الإدارية، في ظرف سنة على الأكثر، نظاما داخليا لـ "الجامعة" بما لا يتعارض مع مقتضيات هذا القانون الأساسي ومكملا وموضحا لمقتضياته.	120	t	1	2026-08-25 15:54:43.611	2026-08-25 15:54:43.611	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 143}
fe2929be-2c31-4bc5-87cb-a1201694da25	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 144	Article 144\nيمكن عقد اجتماعات عن بعد لأجهزة "الجامعة" يحدد النظام الداخلي كل ما يتعلق بذلك.	120	t	1	2026-08-25 15:54:43.694	2026-08-25 15:54:43.694	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 144}
544ba3c5-6f4a-4622-bdfc-e2aeb84b894f	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 145	Article 145\nيشترط في تحمل المسؤولية داخل أجهزة "الجامعة" أن يكون العضو منخرطا بالجامعة لمدة معينة يحددها القانون الداخلي.	120	t	1	2026-08-25 15:54:43.914	2026-08-25 15:54:43.914	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 145}
42332690-0c30-4564-b9a7-8f48a54707ae	b3a23e6c-d0ee-40c3-96c1-77b9bd04ade1	Statuts FNE - Article 146	Article 146\nلا يمكن حل أو إدماج أو إلحاق "الجامعة" بمركزية نقابية إلا بقرار من مؤتمر استثنائي بدعوة من اللجنة الإدارية، ويتخذ القرار بأغلبية ثلثي المؤتمرين الحاضرين أثناء التصويت.\n\nصودق على القانون الأساسي من طرف المؤتمر الوطني الثالث للجامعة الوطنية للتعليم FNE يومي السبت والأحد 1 و 2 أكتوبر 2022 بالمركب الدولي للشباب والطفولة ببوزنيقة.	120	t	1	2026-08-25 15:54:43.975	2026-08-25 15:54:43.975	{"source": "status_fne_clean.txt", "quality": "high", "structure": "article", "sourceType": "manual", "articleNumber": 146}
916675eb-48e9-452a-8d93-198bea2b3ff7	02b66448-7c12-4407-8bf5-63f96369aa2f	[PDF:mokarar_2026_2027.txt] مقرر السنة الدراسية 2026-2027 - Part 1/3	مقرر لوزير التربية الوطنية والتعليم الأولي والرياضة رقم 047.26 بشأن تنظيم السنة الدراسية 2026/2027 تحت شعار "من أجل مدرسة ذات جودة للجميع" الباب الأول: مقتضيات عامةالمادة 2تنطلق السنة الدراسية يوم الثلاثاء 1 شتنبر 2026، وتنتهي في المواعيد المحددة في هذا المقرر حسب الأسلاك والمستويات الدراسية. تنتظم السنة الدراسية في أسدوسين، وتشتمل على الفترات والعمليات التالية:استكمال إجراءات الدخول المدرسي 2026/2027.إعادة تسجيل المتعلمات والمتعلمين غير الملتحقين والمنقطعين عن الدراسة، ورصد الأطفال خارج المدرسة عن طريق قافلة التعبئة المجتمعية.استكمال إعداد وتنفيذ مشروع المؤسسة المندمج برسم السنة الدراسية 2026/2027.الدراسة بما فيها عمليات وأنشطة الدعم والتثبيت وتعزيز المكتسبات السابقة.العمليات التقويمية والامتحانات والإعداد الجماعي للامتحانات الإشهادية.الأنشطة المتعلقة بالحياة المدرسية والأنشطة الرياضية وأنشطة التوجيه المدرسي والمهني.العطل المدرسية.العمليات الخاصة بإجراءات نهاية السنة الدراسية وتقويمها والإعداد للدخول المدرسي الموالي.المادة 3يتم تحديد مختلف المحطات والعمليات والأنشطة المرتبطة بتنظيم الدراسة بأقسام تحضير شهادة التقني العالي وبالأقسام التحضيرية للمدارس العليا برسم السنة الدراسية 2026/2027 بموجب مقررين وزاريين خاصين.المادة 14 يعمل بهذا المقرر ابتداء من تاريخ توقيعه (حرر بالرباط في 09 يوليوز 2026، توقيع وزير التربية الوطنية والتعليم الأولي والرياضة: محمد سعد برادة). ملحق رقم 1: لائحة العطل المدرسية برسم السنة الدراسية 2026/2027المجموع / عدد الأيامالتواريخ (من ... إلى ...)العطلةرقم8 أياممن الأحد 25 أكتوبر 2026 إلى الأحد 1 نوفمبر 2026العطلة البينية الأولى1يوم واحدالأسبوع 6 نوفمبر 2026ذكرى المسيرة الخضراء2يوم واحدالأحد 18 نوفمبر 2026عيد الاستقلال38 أياممن الأحد 6 ديسمبر 2026 إلى الأحد 13 ديسمبر 2026العطلة البينية الثانية4يوم واحدالجمعة 1 يناير 2027رأس السنة الميلادية5يوم واحدالأحد 11 يناير 2027ذكرى تقديم وثيقة الاستقلال6يوم واحدأواسط شهر يناير 2027 (حسب الإعلان)رأس السنة	120	t	1	2026-08-25 15:57:06.917	2026-08-25 15:57:06.917	{"hash": "1ff383e4ce4ff85a750390e45c9c824b4754252e", "part": 1, "importedAt": "2026-08-25T15:57:06.746Z", "sourceFile": "mokarar_2026_2027.txt", "sourceType": "txt", "totalParts": 3}
9902b1ba-8772-48a4-8318-abd75f680082	02b66448-7c12-4407-8bf5-63f96369aa2f	[PDF:mokarar_2026_2027.txt] مقرر السنة الدراسية 2026-2027 - Part 2/3	الأمازيغية78 أياممن الأحد 24 يناير 2027 إلى الأحد 31 يناير 2027عطلة منتصف السنة الدراسية88 أياممن الأحد 14 مارس 2027 إلى الأحد 21 مارس 2027العطلة البينية الثالثة93 أو 4 أياممن 29 رمضان إلى 2 شوال 1448 هـعيد الفطر108 أياممن الأحد 2 مايو 2027 إلى الأحد 9 مايو 2027العطلة البينية الرابعة11يوم واحدالأحد 1 مايو 2027عيد الشغل124 أياممن 9 إلى 12 ذي الحجة 1448 هـعيد الأضحى13يوم واحد1 محرم 1449 هـرأس السنة الهجرية14ملحق رقم 2: تواريخ المراقبة المستمرة والامتحانات1. السلك الابتدائيالأسدوس الأول:إجراء آخر فروض المراقبة المستمرة: من 4 إلى 9 يناير 2027.انتهاء مسك النقط: 16 يناير 2027.الامتحان الموحد المحلي لنيل شهادة الدروس الابتدائية: 18 و19 يناير 2027.عقد مجالس الأقسام: 21 و22 يناير 2027.توزيع بيانات النقط: 23 يناير 2027.الأسدوس الثاني:إجراء آخر فروض المراقبة المستمرة: من 14 إلى 19 يونيو 2027.الإعداد الجماعي للامتحان الموحد الإقليمي: من 21 إلى 24 يونيو 2027.إجراء الامتحان الموحد الإقليمي: 25 و26 يونيو 2027.عقد مجالس الأقسام: 1 و2 يوليوز 2027.توزيع بيانات النقط: 3 يوليوز 2027.2. السلك الثانوي الإعداديالأسدوس الأول:إجراء آخر فروض المراقبة المستمرة: من 4 إلى 9 يناير 2027.إجراء الامتحان الموحد المحلي: 18 و19 يناير 2027.عقد مجالس الأقسام: 21 و22 يناير 2027.توزيع بيانات النقط: 23 يناير 2027.الأسدوس الثاني:إجراء آخر فروض المراقبة المستمرة: من 14 إلى 19 يونيو 2027.الإعداد الجماعي للامتحان الموحد الجهوي: 21 و22 يونيو 2027.إجراء الامتحان الموحد الجهوي: 23 و24 يونيو 2027.عقد مجالس الأقسام والتوجيه: 1 و2 يوليوز 2027.توزيع بيانات النقط: 3 يوليوز 2027.3. الثانوي التأهيلي - الجذع المشتركالأسدوس الأول: آخر الفروض (4 - 9 يناير 2027)، مجالس الأقسام (21 - 22 يناير 2027)، توزيع النقط (23 يناير 2027).الأسدوس الثاني: آخر الفروض (14 - 19 يونيو 2027)، مجالس الأقسام والتوجيه (1 - 2 يوليوز 2027)، توزيع النقط (3 يوليوز 2027).4. الثانوي التأهيلي - السنة الأولى بكالورياالأسدوس الأول: آخر الفروض (4 - 9 يناير	120	t	1	2026-08-25 15:57:07.02	2026-08-25 15:57:07.02	{"hash": "dcc62eed04d4900d825d8821a37b74af6621687a", "part": 2, "importedAt": "2026-08-25T15:57:06.746Z", "sourceFile": "mokarar_2026_2027.txt", "sourceType": "txt", "totalParts": 3}
49f8e246-1889-4700-afcf-17ad2c84addc	02b66448-7c12-4407-8bf5-63f96369aa2f	[PDF:mokarar_2026_2027.txt] مقرر السنة الدراسية 2026-2027 - Part 3/3	2027)، توزيع النقط (23 يناير 2027).الأسدوس الثاني والامتحان الجهوي:الدورة العادية للامتحان الجهوي الموحد: 28 و29 ماي 2027.إجراء آخر فروض المراقبة المستمرة: من 14 إلى 19 يونيو 2027.الدورة الاستدراكية للامتحان الجهوي الموحد: 28 و29 يونيو 2027.الإعلان عن نتائج الامتحان الجهوي: 2 يوليوز 2027.مجالس الأقسام والتوجيه وتسليم النقط: 9 و10 يوليوز 2027.5. الثانوي التأهيلي - السنة الثانية بكالورياالأسدوس الأول: آخر الفروض (4 - 9 يناير 2027)، توزيع النقط (23 يناير 2027).الأسدوس الثاني والامتحان الوطني:إجراء آخر فروض المراقبة المستمرة: من 17 إلى 22 ماي 2027.الدورة العادية للامتحان الوطني الموحد: من 1 إلى 3 يونيو 2027.الإعلان عن نتائج الدورة العادية: 19 يونيو 2027.الدورة الاستدراكية للامتحان الوطني الموحد: من 1 إلى 3 يوليوز 2027.الإعلان عن نتائج الدورة الاستدراكية: 10 يوليوز 2027.6. مدارس الفرصة الثانيةمسك نقط المراقبة المستمرة الأسدوس الأول: بين 4 و13 يناير 2027.مسك نقط المراقبة المستمرة الأسدوس الثاني: بين 8 و15 يونيو 2027.اختبارات الإدماج والتوجيه: خلال شهر يونيو 2027.ملحق رقم 3: مباريات التميز والمسابقات الوطنية 2026/2027الأولمبياد الوطنية (الرياضيات، الفيزياء، الكيمياء، البيولوجيا):مراحل فروض الانتقاء تنظم ما بين يناير وأبريل 2027 حسب المستويات.نهائي أولمبياد البراعم (6 ابتدائي): يوليوز 2027.نهائي الأولمبياد الجهوية (3 إعدادي): ماي 2027.نهائي أولمبياد الأشبال: يوليوز 2027.مسابقة الروبوتيات التربوية (3 إعدادي): المباراة النهائية في 2027.مسابقة كنغر الدولية في الرياضيات (2، 4، 6 ابتدائي): أبريل 2027.المباراة العامة للعلوم والتقنيات (2 بكالوريا): يوليوز 2027.تحدي الشباب في العلوم والتقنيات (الإعدادي والتأهيلي): المرحلة الأولى (مارس 2027)، الثانية (ماي 2027)، النهائية (نونبر/دجنبر 2027).المسابقات الوطنية في البرمجة والروبوتيك (الجذع المشترك العلمي، 2 و3 إعدادي): ماي - يونيو 2027.المسابقة الوطنية للقراءة وتحدي القراءة العربي: مايو ويوليوز 2027 / أبريل ومايو 2027.	120	t	1	2026-08-25 15:57:07.089	2026-08-25 15:57:07.089	{"hash": "d9eca583aa5cee6fc63702c904a759d09a1779e8", "part": 3, "importedAt": "2026-08-25T15:57:06.746Z", "sourceFile": "mokarar_2026_2027.txt", "sourceType": "txt", "totalParts": 3}
\.


--
-- Data for Name: Message; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Message" (id, "conversationId", role, content, "mediaType", "mediaUrl", "toolCalls", "createdAt") FROM stdin;
\.


--
-- Data for Name: SLARule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SLARule" (id, name, description, channel, priority, "firstResponseMins", "resolutionMins", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Schedule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Schedule" (id, "teamMemberId", "dayOfWeek", "startTime", "endTime") FROM stdin;
\.


--
-- Data for Name: Settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Settings" (id, "businessName", "businessDesc", "welcomeMessage", tone, language, "aiProvider", "aiModel", "aiApiKey", "maxTokens", temperature, "elevenLabsKey", "elevenLabsVoice", "twilioSid", "twilioToken", "twilioPhone", "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "imapHost", "imapPort", "imapUser", "imapPass", "whatsappMode", "whatsappApiKey", "whatsappPhone", "createdAt", "updatedAt", "telegramBotToken") FROM stdin;
default	My Business		Hello! How can I help you today?	friendly	auto	anthropic	claude-3-5-sonnet-20241022		2048	0.7							587					993			web			2026-08-25 15:49:34.769	2026-08-25 15:55:53.996	
\.


--
-- Data for Name: Tag; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Tag" (id, name, color, "createdAt") FROM stdin;
\.


--
-- Data for Name: TeamMember; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TeamMember" (id, name, email, phone, role, expertise, "departmentId", "isAvailable", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Ticket; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Ticket" (id, "conversationId", "departmentId", "assignedToId", title, description, status, priority, resolution, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Webhook; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Webhook" (id, name, description, url, method, headers, "isActive", "triggerOn", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: WebhookDelivery; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."WebhookDelivery" (id, "webhookId", event, payload, status, "statusCode", attempts, "lastError", "nextRetryAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
07b6b747-5128-41f7-93ed-fd259e3da16c	61e4d3729b7f1e206c5430bae82c37bfdc8cde13e80b00f2e74877dcd5134b02	2026-08-25 15:48:44.60572+00	20260404212438_init	\N	\N	2026-08-25 15:48:41.029531+00	1
831b616c-b47b-427b-ac64-f6ef6ad098cb	e4c7053ce3f40f6de9affc3302cd623c0bb19dc292d30b01606bd4416f2a3d0c	2026-08-25 15:48:45.089978+00	20260404215016_add_activity_sla_canned	\N	\N	2026-08-25 15:48:44.614111+00	1
cd5eadde-b7ff-4421-b380-e2d3269ea258	492c89eb00ca732888babf318e411aa0118944dcb2eb7f83fbdd1792b4653c05	2026-08-25 15:48:46.070731+00	20260404215604_add_crm_automation_features	\N	\N	2026-08-25 15:48:45.131759+00	1
52961688-639c-407d-9f05-477fd1012d68	e8289b6333ab4649823042aaa1cd73602a586eb24e60b85f47b0eaa9f6fe5b2a	2026-08-25 15:48:46.557817+00	20260407000000_add_customer_link_webhook_delivery_indexes	\N	\N	2026-08-25 15:48:46.149329+00	1
fee90c26-b517-4002-a5a5-a471e1d380a8	e6b1e18742fc86f01572a51e5fd382e538436badb93911717def503884cdef88	2026-08-25 15:48:46.59115+00	20260408000000_add_internal_note_cascade	\N	\N	2026-08-25 15:48:46.566222+00	1
0bce7528-7e57-4373-b84d-bc8a5a1e60b3	a6f880593888290094ed43fdc714f3016018c3a91a190f09c06608e58af9e6d8	2026-08-25 15:48:46.624573+00	20260408010000_add_knowledge_metadata	\N	\N	2026-08-25 15:48:46.599592+00	1
fa70d92c-ab73-4132-b7f1-82393dcfba1b	38f4ab1799143ea55d7926761f3e099e4db2c1d6de83f7a92416eb9a07aa05de	2026-08-25 15:48:46.79148+00	20260408020000_add_campaigns_flows_telegram	\N	\N	2026-08-25 15:48:46.63295+00	1
\.


--
-- Name: ActivityLog ActivityLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_pkey" PRIMARY KEY (id);


--
-- Name: Admin Admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_pkey" PRIMARY KEY (id);


--
-- Name: ApiKey ApiKey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiKey"
    ADD CONSTRAINT "ApiKey_pkey" PRIMARY KEY (id);


--
-- Name: AutomationRule AutomationRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationRule"
    ADD CONSTRAINT "AutomationRule_pkey" PRIMARY KEY (id);


--
-- Name: BusinessHours BusinessHours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BusinessHours"
    ADD CONSTRAINT "BusinessHours_pkey" PRIMARY KEY (id);


--
-- Name: CallLog CallLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CallLog"
    ADD CONSTRAINT "CallLog_pkey" PRIMARY KEY (id);


--
-- Name: Campaign Campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaign"
    ADD CONSTRAINT "Campaign_pkey" PRIMARY KEY (id);


--
-- Name: CannedResponse CannedResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CannedResponse"
    ADD CONSTRAINT "CannedResponse_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: Channel Channel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Channel"
    ADD CONSTRAINT "Channel_pkey" PRIMARY KEY (id);


--
-- Name: ConversationTag ConversationTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ConversationTag"
    ADD CONSTRAINT "ConversationTag_pkey" PRIMARY KEY (id);


--
-- Name: Conversation Conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY (id);


--
-- Name: CustomerNote CustomerNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerNote"
    ADD CONSTRAINT "CustomerNote_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: Department Department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_pkey" PRIMARY KEY (id);


--
-- Name: Flow Flow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Flow"
    ADD CONSTRAINT "Flow_pkey" PRIMARY KEY (id);


--
-- Name: InternalNote InternalNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InternalNote"
    ADD CONSTRAINT "InternalNote_pkey" PRIMARY KEY (id);


--
-- Name: KnowledgeEntry KnowledgeEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KnowledgeEntry"
    ADD CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY (id);


--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


--
-- Name: SLARule SLARule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SLARule"
    ADD CONSTRAINT "SLARule_pkey" PRIMARY KEY (id);


--
-- Name: Schedule Schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedule"
    ADD CONSTRAINT "Schedule_pkey" PRIMARY KEY (id);


--
-- Name: Settings Settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_pkey" PRIMARY KEY (id);


--
-- Name: Tag Tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_pkey" PRIMARY KEY (id);


--
-- Name: TeamMember TeamMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_pkey" PRIMARY KEY (id);


--
-- Name: Ticket Ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY (id);


--
-- Name: WebhookDelivery WebhookDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY (id);


--
-- Name: Webhook Webhook_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhook"
    ADD CONSTRAINT "Webhook_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ActivityLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_createdAt_idx" ON public."ActivityLog" USING btree ("createdAt");


--
-- Name: ActivityLog_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_entity_idx" ON public."ActivityLog" USING btree (entity);


--
-- Name: Admin_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Admin_username_key" ON public."Admin" USING btree (username);


--
-- Name: ApiKey_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApiKey_key_idx" ON public."ApiKey" USING btree (key);


--
-- Name: ApiKey_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ApiKey_key_key" ON public."ApiKey" USING btree (key);


--
-- Name: CallLog_callSid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CallLog_callSid_key" ON public."CallLog" USING btree ("callSid");


--
-- Name: Channel_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Channel_type_key" ON public."Channel" USING btree (type);


--
-- Name: ConversationTag_conversationId_tagId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ConversationTag_conversationId_tagId_key" ON public."ConversationTag" USING btree ("conversationId", "tagId");


--
-- Name: Conversation_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_channel_idx" ON public."Conversation" USING btree (channel);


--
-- Name: Conversation_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_channel_status_idx" ON public."Conversation" USING btree (channel, status);


--
-- Name: Conversation_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_createdAt_idx" ON public."Conversation" USING btree ("createdAt");


--
-- Name: Conversation_customerContact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_customerContact_idx" ON public."Conversation" USING btree ("customerContact");


--
-- Name: Conversation_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_customerId_idx" ON public."Conversation" USING btree ("customerId");


--
-- Name: Conversation_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_status_idx" ON public."Conversation" USING btree (status);


--
-- Name: CustomerNote_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerNote_customerId_idx" ON public."CustomerNote" USING btree ("customerId");


--
-- Name: Customer_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Customer_email_idx" ON public."Customer" USING btree (email);


--
-- Name: Customer_lastContact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Customer_lastContact_idx" ON public."Customer" USING btree ("lastContact");


--
-- Name: Customer_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Customer_phone_idx" ON public."Customer" USING btree (phone);


--
-- Name: Customer_whatsapp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Customer_whatsapp_idx" ON public."Customer" USING btree (whatsapp);


--
-- Name: InternalNote_conversationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InternalNote_conversationId_idx" ON public."InternalNote" USING btree ("conversationId");


--
-- Name: KnowledgeEntry_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "KnowledgeEntry_categoryId_idx" ON public."KnowledgeEntry" USING btree ("categoryId");


--
-- Name: Message_conversationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_conversationId_createdAt_idx" ON public."Message" USING btree ("conversationId", "createdAt");


--
-- Name: Message_conversationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_conversationId_idx" ON public."Message" USING btree ("conversationId");


--
-- Name: Schedule_dayOfWeek_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Schedule_dayOfWeek_idx" ON public."Schedule" USING btree ("dayOfWeek");


--
-- Name: Schedule_teamMemberId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Schedule_teamMemberId_idx" ON public."Schedule" USING btree ("teamMemberId");


--
-- Name: Tag_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tag_name_key" ON public."Tag" USING btree (name);


--
-- Name: TeamMember_departmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TeamMember_departmentId_idx" ON public."TeamMember" USING btree ("departmentId");


--
-- Name: Ticket_assignedToId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Ticket_assignedToId_idx" ON public."Ticket" USING btree ("assignedToId");


--
-- Name: Ticket_departmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Ticket_departmentId_idx" ON public."Ticket" USING btree ("departmentId");


--
-- Name: Ticket_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Ticket_status_idx" ON public."Ticket" USING btree (status);


--
-- Name: WebhookDelivery_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON public."WebhookDelivery" USING btree (status, "nextRetryAt");


--
-- Name: WebhookDelivery_webhookId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_webhookId_idx" ON public."WebhookDelivery" USING btree ("webhookId");


--
-- Name: ConversationTag ConversationTag_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ConversationTag"
    ADD CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ConversationTag ConversationTag_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ConversationTag"
    ADD CONSTRAINT "ConversationTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tag"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Conversation Conversation_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CustomerNote CustomerNote_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerNote"
    ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InternalNote InternalNote_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InternalNote"
    ADD CONSTRAINT "InternalNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: KnowledgeEntry KnowledgeEntry_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KnowledgeEntry"
    ADD CONSTRAINT "KnowledgeEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Message Message_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TeamMember TeamMember_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public."Department"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Ticket Ticket_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."TeamMember"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public."Department"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebhookDelivery WebhookDelivery_webhookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES public."Webhook"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict RnagTzpEbk7aXH9gUQkMC2QuopVy2QTU4vM5FbcPPyh7ARzPwdWrH3zATDzkpUA

