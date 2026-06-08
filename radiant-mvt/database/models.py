"""
SQLAlchemy ORM models for Radiant-MVT Trading Intelligence Platform.
All 18 tables matching schema.sql exactly.
"""
from sqlalchemy.types import REAL as Real
from sqlalchemy import (
    Column, Integer, Text, Boolean, ForeignKey,
    CheckConstraint, Index, DateTime, Date
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(Text, unique=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    full_name = Column(Text, nullable=False)
    role = Column(Text, nullable=False)
    desk = Column(Text)
    title = Column(Text)
    is_active = Column(Integer, default=1)
    last_login = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('trader','risk','executive','admin')", name="chk_user_role"),
    )

    trades = relationship("Trade", back_populates="trader", foreign_keys="Trade.trader_id")
    books = relationship("Book", back_populates="trader")
    alerts_assigned = relationship("Alert", back_populates="assigned_user")
    chat_messages = relationship("ChatHistory", back_populates="user")
    desk_decisions = relationship("DeskDecision", back_populates="trader")
    ai_recommendations = relationship("AIRecommendation", back_populates="user")
    monthly_actuals = relationship("MonthlyActual", back_populates="trader")
    emails = relationship("Email", back_populates="user")
    decision_queue = relationship("DecisionQueue", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")

    def __repr__(self):
        return f"<User id={self.id} email={self.email} role={self.role}>"


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    commodity = Column(Text, nullable=False)
    trader_id = Column(Integer, ForeignKey("users.id"))
    annual_target = Column(Real)
    strategy = Column(Text)
    is_active = Column(Integer, default=1)

    trader = relationship("User", back_populates="books")
    trades = relationship("Trade", back_populates="book")
    positions = relationship("Position", back_populates="book")
    monthly_actuals = relationship("MonthlyActual", back_populates="book")
    performance_targets = relationship("PerformanceTarget", back_populates="book")
    desk_decisions = relationship("DeskDecision", back_populates="book")

    def __repr__(self):
        return f"<Book id={self.id} name={self.name} commodity={self.commodity}>"


class Counterparty(Base):
    __tablename__ = "counterparties"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    short_name = Column(Text)
    country = Column(Text)
    credit_limit = Column(Real)
    credit_used = Column(Real, default=0)
    isda_status = Column(Text, default="Signed")
    typical_trade_size_bbl = Column(Real)
    preferred_commodities = Column(Text)
    avg_response_hours = Column(Real)
    seasonal_activity = Column(Text)
    relationship_since = Column(Integer)
    contact_name = Column(Text)
    contact_email = Column(Text)

    trades = relationship("Trade", back_populates="counterparty")
    vessels = relationship("Vessel", back_populates="booked_counterparty")
    desk_decisions = relationship("DeskDecision", back_populates="counterparty")

    def __repr__(self):
        return f"<Counterparty id={self.id} name={self.name}>"


class Vessel(Base):
    __tablename__ = "vessels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    imo_number = Column(Text)
    capacity_m3 = Column(Real, default=27500)
    vessel_type = Column(Text, default="Multi-gas carrier")
    flag = Column(Text, default="Bahamas")
    current_lat = Column(Real)
    current_lon = Column(Real)
    origin_port = Column(Text)
    destination_port = Column(Text)
    eta = Column(DateTime)
    original_eta = Column(DateTime)
    delay_hours = Column(Real, default=0)
    status = Column(Text, default="En Route")
    cargo_commodity = Column(Text, default="Ethane")
    cargo_volume_mt = Column(Real)
    charter_party_rate = Column(Real, default=45000)
    allowed_laytime_hours = Column(Real, default=36)
    booked_counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    booked_counterparty = relationship("Counterparty", back_populates="vessels")
    emails_linked = relationship("Email", back_populates="linked_vessel")
    decision_queue_items = relationship("DecisionQueue", back_populates="related_vessel")

    def __repr__(self):
        return f"<Vessel id={self.id} name={self.name} status={self.status}>"


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_ref = Column(Text, unique=True, nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"))
    trader_id = Column(Integer, ForeignKey("users.id"))
    counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    commodity = Column(Text, nullable=False)
    trade_type = Column(Text, nullable=False)
    direction = Column(Text, nullable=False)
    volume = Column(Real, nullable=False)
    volume_unit = Column(Text, default="bbl")
    price = Column(Real)
    price_basis = Column(Text)
    currency = Column(Text, default="USD")
    trade_date = Column(Date)
    delivery_start = Column(Date)
    delivery_end = Column(Date)
    delivery_location = Column(Text)
    incoterms = Column(Text)
    status = Column(Text, default="Confirmed")
    source_system = Column(Text, default="RightAngle")
    strategy_type = Column(Text)
    pnl_realised = Column(Real, default=0)
    pnl_unrealised = Column(Real, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    is_anomalous = Column(Integer, default=0)
    anomaly_reason = Column(Text)

    __table_args__ = (
        CheckConstraint("trade_type IN ('Physical','Paper','Exchange','Swap','Option')", name="chk_trade_type"),
        CheckConstraint("direction IN ('Buy','Sell')", name="chk_direction"),
        CheckConstraint("status IN ('Pending','Confirmed','Amended','Novated','Cancelled','Settled')", name="chk_trade_status"),
        CheckConstraint("strategy_type IN ('Directional','Spread','Basis','Arb','Hedge') OR strategy_type IS NULL", name="chk_strategy"),
    )

    book = relationship("Book", back_populates="trades")
    trader = relationship("User", back_populates="trades", foreign_keys=[trader_id])
    counterparty = relationship("Counterparty", back_populates="trades")
    alerts = relationship("Alert", back_populates="affected_trade")
    emails_linked = relationship("Email", back_populates="linked_trade")
    decision_queue_items = relationship("DecisionQueue", back_populates="related_trade")

    def __repr__(self):
        return f"<Trade id={self.id} ref={self.trade_ref} {self.direction} {self.volume} {self.commodity}>"


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id"))
    commodity = Column(Text, nullable=False)
    region = Column(Text)
    tenor = Column(Text)
    delivery_month = Column(Text)
    physical_volume = Column(Real, default=0)
    paper_volume = Column(Real, default=0)
    exchange_volume = Column(Real, default=0)
    net_volume = Column(Real, default=0)
    volume_unit = Column(Text, default="bbl")
    avg_price = Column(Real)
    mtm_price = Column(Real)
    mtm_pnl = Column(Real, default=0)
    hedge_ratio = Column(Real, default=0)
    var_contribution = Column(Real, default=0)
    as_of = Column(DateTime, server_default=func.now())

    book = relationship("Book", back_populates="positions")

    def __repr__(self):
        return f"<Position id={self.id} book_id={self.book_id} commodity={self.commodity} net={self.net_volume}>"


class MarketData(Base):
    __tablename__ = "market_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    commodity = Column(Text, nullable=False)
    price = Column(Real, nullable=False)
    price_unit = Column(Text, default="USD/bbl")
    source = Column(Text, default="yfinance")
    change_1d = Column(Real)
    change_pct_1d = Column(Real)
    high_1d = Column(Real)
    low_1d = Column(Real)
    volume = Column(Real)
    timestamp = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_market_data_commodity_ts", "commodity", "timestamp"),
    )

    def __repr__(self):
        return f"<MarketData id={self.id} commodity={self.commodity} price={self.price}>"


class ForwardCurve(Base):
    __tablename__ = "forward_curves"

    id = Column(Integer, primary_key=True, autoincrement=True)
    commodity = Column(Text, nullable=False)
    tenor = Column(Text, nullable=False)
    delivery_month = Column(Text, nullable=False)
    price = Column(Real, nullable=False)
    basis_vs_prompt = Column(Real, default=0)
    curve_date = Column(Date)
    source = Column(Text, default="Simulated")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ForwardCurve id={self.id} commodity={self.commodity} tenor={self.tenor} price={self.price}>"


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, autoincrement=True)
    headline = Column(Text, nullable=False)
    source = Column(Text)
    url = Column(Text)
    published_at = Column(DateTime)
    summary = Column(Text)
    sentiment_score = Column(Real)
    commodities_tagged = Column(Text)
    regions_tagged = Column(Text)
    counterparties_tagged = Column(Text)
    market_impact = Column(Text)
    relevance_score = Column(Real, default=0)
    ingested_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint("market_impact IN ('Bullish','Bearish','Neutral','Unknown') OR market_impact IS NULL", name="chk_market_impact"),
    )

    def __repr__(self):
        return f"<News id={self.id} headline={self.headline[:40]}>"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(Text, nullable=False)
    severity = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    affected_trade_id = Column(Integer, ForeignKey("trades.id"))
    affected_book = Column(Text)
    estimated_impact = Column(Real)
    ai_explanation = Column(Text)
    ai_draft_action = Column(Text)
    status = Column(Text, default="Open")
    assigned_to = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime)

    __table_args__ = (
        CheckConstraint("severity IN ('Critical','High','Medium','Low')", name="chk_alert_severity"),
        CheckConstraint("status IN ('Open','Acknowledged','Resolved','Dismissed')", name="chk_alert_status"),
    )

    affected_trade = relationship("Trade", back_populates="alerts")
    assigned_user = relationship("User", back_populates="alerts_assigned")
    decision_queue_items = relationship("DecisionQueue", back_populates="related_alert")

    def __repr__(self):
        return f"<Alert id={self.id} severity={self.severity} title={self.title[:40]}>"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action_type = Column(Text, nullable=False)
    entity_type = Column(Text)
    entity_id = Column(Integer)
    description = Column(Text)
    old_value = Column(Text)
    new_value = Column(Text)
    ai_involved = Column(Integer, default=0)
    ai_recommendation = Column(Text)
    ai_accepted = Column(Integer)
    ip_address = Column(Text)
    timestamp = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog id={self.id} action={self.action_type} entity={self.entity_type}:{self.entity_id}>"


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Text)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    screen_context = Column(Text)
    sources_cited = Column(Text)
    timestamp = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="chk_chat_role"),
    )

    user = relationship("User", back_populates="chat_messages")

    def __repr__(self):
        return f"<ChatHistory id={self.id} user_id={self.user_id} role={self.role}>"


class DeskDecision(Base):
    __tablename__ = "desk_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    decision_date = Column(Date, nullable=False)
    trader_id = Column(Integer, ForeignKey("users.id"))
    book_id = Column(Integer, ForeignKey("books.id"))
    commodity = Column(Text)
    strategy_type = Column(Text)
    structure_description = Column(Text, nullable=False)
    rationale = Column(Text)
    market_context = Column(Text)
    volume = Column(Real)
    entry_price = Column(Real)
    exit_price = Column(Real)
    hold_days = Column(Integer)
    pnl_realised = Column(Real)
    outcome = Column(Text)
    lessons_learned = Column(Text)
    failure_mode = Column(Text)
    tags = Column(Text)
    counterparty_id = Column(Integer, ForeignKey("counterparties.id"))
    similarity_hash = Column(Text)

    __table_args__ = (
        CheckConstraint("outcome IN ('Profitable','Loss','Breakeven','Ongoing') OR outcome IS NULL", name="chk_outcome"),
    )

    trader = relationship("User", back_populates="desk_decisions")
    book = relationship("Book", back_populates="desk_decisions")
    counterparty = relationship("Counterparty", back_populates="desk_decisions")

    def __repr__(self):
        return f"<DeskDecision id={self.id} date={self.decision_date} outcome={self.outcome}>"


class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    recommendation_type = Column(Text, nullable=False)
    title = Column(Text)
    content = Column(Text, nullable=False)
    factors = Column(Text)
    confidence_factors = Column(Text)
    ai_provider = Column(Text, default="claude")
    status = Column(Text, default="Pending")
    rejection_reason = Column(Text)
    actual_outcome = Column(Real)
    created_at = Column(DateTime, server_default=func.now())
    actioned_at = Column(DateTime)

    __table_args__ = (
        CheckConstraint("status IN ('Pending','Accepted','Rejected','Modified','Expired')", name="chk_rec_status"),
    )

    user = relationship("User", back_populates="ai_recommendations")

    def __repr__(self):
        return f"<AIRecommendation id={self.id} type={self.recommendation_type} status={self.status}>"


class PerformanceTarget(Base):
    __tablename__ = "performance_targets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"))
    trader_id = Column(Integer, ForeignKey("users.id"))
    annual_target = Column(Real, nullable=False)
    q1_target = Column(Real)
    q2_target = Column(Real)
    q3_target = Column(Real)
    q4_target = Column(Real)
    volume_target = Column(Real)
    return_on_capital_target = Column(Real)

    book = relationship("Book", back_populates="performance_targets")

    def __repr__(self):
        return f"<PerformanceTarget id={self.id} year={self.year} annual={self.annual_target}>"


class MonthlyActual(Base):
    __tablename__ = "monthly_actuals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"))
    trader_id = Column(Integer, ForeignKey("users.id"))
    pnl = Column(Real, default=0)
    volume_traded = Column(Real, default=0)
    trades_count = Column(Integer, default=0)
    win_count = Column(Integer, default=0)
    loss_count = Column(Integer, default=0)
    best_trade_pnl = Column(Real)
    worst_trade_pnl = Column(Real)
    var_avg = Column(Real)
    notes = Column(Text)

    book = relationship("Book", back_populates="monthly_actuals")
    trader = relationship("User", back_populates="monthly_actuals")

    def __repr__(self):
        return f"<MonthlyActual id={self.id} {self.year}-{self.month:02d} pnl={self.pnl}>"


class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    direction = Column(Text, nullable=False)
    from_email = Column(Text)
    from_name = Column(Text)
    to_email = Column(Text)
    subject = Column(Text, nullable=False)
    body = Column(Text)
    received_at = Column(DateTime, server_default=func.now())
    ai_summary = Column(Text)
    ai_priority = Column(Text)
    ai_action_required = Column(Text)
    ai_draft_reply = Column(Text)
    ai_linked_trade_id = Column(Integer, ForeignKey("trades.id"))
    ai_linked_vessel_id = Column(Integer, ForeignKey("vessels.id"))
    ai_suggested_contacts = Column(Text)
    deadline = Column(DateTime)
    status = Column(Text, default="Unread")
    thread_id = Column(Text)

    __table_args__ = (
        CheckConstraint("direction IN ('Inbound','Outbound')", name="chk_email_direction"),
        CheckConstraint("ai_priority IN ('Critical','High','Medium','Low','FYI') OR ai_priority IS NULL", name="chk_ai_priority"),
        CheckConstraint("status IN ('Unread','Read','Actioned','Replied','Dismissed')", name="chk_email_status"),
    )

    user = relationship("User", back_populates="emails")
    linked_trade = relationship("Trade", back_populates="emails_linked", foreign_keys=[ai_linked_trade_id])
    linked_vessel = relationship("Vessel", back_populates="emails_linked", foreign_keys=[ai_linked_vessel_id])

    def __repr__(self):
        return f"<Email id={self.id} subject={self.subject[:40]} status={self.status}>"


class DecisionQueue(Base):
    __tablename__ = "decision_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(Text, nullable=False)
    description = Column(Text)
    decision_type = Column(Text)
    potential_impact = Column(Real)
    impact_description = Column(Text)
    urgency = Column(Text)
    deadline = Column(DateTime)
    related_trade_id = Column(Integer, ForeignKey("trades.id"))
    related_vessel_id = Column(Integer, ForeignKey("vessels.id"))
    related_alert_id = Column(Integer, ForeignKey("alerts.id"))
    status = Column(Text, default="Pending")
    snooze_until = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
    reasoning_text = Column(Text)           # Pre-generated AI reasoning (cached)
    reasoning_generated_at = Column(DateTime)  # When reasoning was last generated

    __table_args__ = (
        CheckConstraint("urgency IN ('Critical','High','Medium','Low') OR urgency IS NULL", name="chk_dq_urgency"),
        CheckConstraint("status IN ('Pending','Snoozed','Delegated','Completed','Dismissed')", name="chk_dq_status"),
    )

    user = relationship("User", back_populates="decision_queue")
    related_trade = relationship("Trade", back_populates="decision_queue_items")
    related_vessel = relationship("Vessel", back_populates="decision_queue_items")
    related_alert = relationship("Alert", back_populates="decision_queue_items")

    def __repr__(self):
        return f"<DecisionQueue id={self.id} title={self.title[:40]} urgency={self.urgency}>"


class RegulatoryFiling(Base):
    __tablename__ = "regulatory_filings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    regulation = Column(Text, nullable=False)
    filing_type = Column(Text)
    status = Column(Text, default="Current")
    next_deadline = Column(DateTime)
    last_submitted = Column(DateTime)
    notes = Column(Text)
    missing_fields = Column(Text)

    __table_args__ = (
        CheckConstraint("regulation IN ('EMIR','REMIT','MiFID II','Dodd-Frank')", name="chk_regulation"),
        CheckConstraint("status IN ('Current','Due Soon','Overdue','Submitted')", name="chk_reg_status"),
    )

    def __repr__(self):
        return f"<RegulatoryFiling id={self.id} regulation={self.regulation} status={self.status}>"


class DemoScenario(Base):
    __tablename__ = "demo_scenarios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scenario_key = Column(Text, unique=True, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    payload = Column(Text, nullable=False)
    trigger_type = Column(Text)
    is_active = Column(Integer, default=1)

    def __repr__(self):
        return f"<DemoScenario id={self.id} key={self.scenario_key}>"


class AppConfig(Base):
    __tablename__ = "app_config"

    key = Column(Text, primary_key=True)
    value = Column(Text)
    description = Column(Text)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<AppConfig key={self.key} value={self.value}>"




class ExternalConnector(Base):
    __tablename__ = "external_connectors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    connector_type = Column(Text, nullable=False)   # etrm | market_data | news | ai_model
    provider = Column(Text, nullable=False)          # RightAngle | Bloomberg | NewsAPI | LMStudio
    host_url = Column(Text)
    api_key = Column(Text)
    extra_config = Column(Text)                      # JSON blob
    polling_interval_sec = Column(Integer, default=60)
    is_active = Column(Integer, default=1)
    last_connected_at = Column(DateTime)
    last_status = Column(Text, default="Not tested")
    last_error = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ExternalConnector id={self.id} name={self.name} type={self.connector_type}>"
