"""
Seed 11 realistic inbox emails for Radiant-MVT demo.
Covers: trade confirmations, price queries, risk queries, broker quotes,
vessel ops updates, counterparty inquiries, regulatory reminders,
market commentary, executive requests, and bank outlooks.
"""
import logging
from datetime import datetime, timedelta
from database.db import SessionLocal
from database.models import Email, User

logger = logging.getLogger(__name__)


def seed_emails(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(Email).first():
            logger.info("Emails already seeded — skipping.")
            return

        trader = db.query(User).filter(User.role == "trader").first()
        if not trader:
            logger.error("seed_emails: no trader user found. Run seed_users first.")
            return

        now = datetime.utcnow()

        emails_data = [
            # 1 — Vitol trade confirmation (Critical, ~6h deadline)
            {
                "direction": "Inbound",
                "from_email": "james.thornton@vitol.com",
                "from_name": "James Thornton",
                "from_company": "Vitol",
                "subject": "Confirmation Required — Brent Jun Cargo RMVT-0234",
                "body": (
                    "Dear Alex,\n\n"
                    "Please confirm the following transaction:\n\n"
                    "Commodity: Dated Brent Crude\n"
                    "Volume: 600,000 barrels\n"
                    "Delivery: CIF Rotterdam, 15 June 2026\n"
                    "Price: Dated Brent + $0.18/bbl\n"
                    "Payment: 30 days net\n\n"
                    "Please confirm by 15:00 London time today.\n\n"
                    "Best regards,\n"
                    "James Thornton\n"
                    "Vitol Group"
                ),
                "ai_priority": "Critical",
                "ai_summary": "Vitol requesting written confirmation of 600K bbl Brent Jun cargo. Deadline 15:00 today.",
                "ai_action_required": "Send written trade confirmation by 15:00",
                "deadline_hours": 5.75,
                "received_offset_hours": -0.5,
            },
            # 2 — Shell NGL price query
            {
                "direction": "Inbound",
                "from_email": "pricing@shell-trading.com",
                "from_name": "Rebecca Okafor",
                "from_company": "Shell",
                "subject": "Price query — NGL Jun-Jul cargo, Grangemouth",
                "body": (
                    "Hi Alex,\n\n"
                    "Could you provide an indicative price for 15,000 MT NGLs for Jun delivery to Grangemouth? "
                    "We're looking at a potential swap with our Rotterdam stocks.\n\n"
                    "Thanks,\nRebecca"
                ),
                "ai_priority": "High",
                "ai_summary": "Shell requesting indicative NGL price for 15,000 MT Jun delivery Grangemouth.",
                "ai_action_required": "Reply with indicative NGL price",
                "deadline_hours": 3.0,
                "received_offset_hours": -0.75,
            },
            # 3 — Risk desk VaR query (internal)
            {
                "direction": "Inbound",
                "from_email": "s.mitchell@ineos-ts.com",
                "from_name": "Sarah Mitchell",
                "from_company": "INEOS T&S Risk",
                "subject": "VaR query — Crude book Jun positions",
                "body": (
                    "Alex,\n\n"
                    "The crude book VaR has moved above 75% of limit this morning. Can you provide rationale "
                    "for the current Urals long before I update the CRO report? Specifically:\n"
                    "1. Is this intentional ahead of OPEC+?\n"
                    "2. Any planned hedges?\n\n"
                    "Sarah"
                ),
                "ai_priority": "High",
                "ai_summary": "Risk team querying crude book VaR (75% of limit). Needs rationale for Urals long for CRO report.",
                "ai_action_required": "Reply with position rationale before EOD",
                "deadline_hours": 7.0,
                "received_offset_hours": -1.25,
            },
            # 4 — Marex broker quote (expires 90 mins)
            {
                "direction": "Inbound",
                "from_email": "energy.desk@marex.com",
                "from_name": "Tom Blackwell",
                "from_company": "Marex",
                "subject": "ICE Brent Jul Offer — 500K bbl @ DTD+$0.22 (valid 90 mins)",
                "body": (
                    "Alex,\n\n"
                    "I have a seller offering 500K bbl Dated Brent July delivery, CIF Rotterdam:\n\n"
                    "Price: Dated Brent + $0.22/bbl\n"
                    "Volume: 500,000 barrels\n"
                    "Delivery: 10-15 July 2026, CIF Rotterdam\n"
                    "Offer valid: 90 minutes from sending (expires ~11:45 LN)\n\n"
                    "Let me know — I have another buyer sniffing around.\n\n"
                    "Tom\nMarex Energy"
                ),
                "ai_priority": "High",
                "ai_summary": "Marex brokering 500K bbl Brent Jul CIF Rotterdam at DTD+$0.22. Offer expires ~11:45 London.",
                "ai_action_required": "Decide on offer within 90 minutes — check against Jul position target",
                "deadline_hours": 1.5,
                "received_offset_hours": -0.1,
            },
            # 5 — Dragon vessel ops: JS Ineos Innovation ETA update
            {
                "direction": "Inbound",
                "from_email": "ops@ineos-shipping.com",
                "from_name": "Captain R. Svensson (Master, JS Ineos Innovation)",
                "from_company": "INEOS Shipping",
                "subject": "JS Ineos Innovation — ETA Update: +14 Hours (North Atlantic Weather)",
                "body": (
                    "Dear Alex / INEOS Trading Team,\n\n"
                    "Please be advised that JS Ineos Innovation ETA to Rafnes has been revised:\n\n"
                    "Original ETA: 12 June 2026, 06:00 local\n"
                    "Revised ETA:  12 June 2026, 20:00 local\n"
                    "Delay:        14 hours\n\n"
                    "Reason: Force 10 North Atlantic storm system encountered at 55.2°N 10.8°W. "
                    "Speed reduced from 17 to 13 knots for safety. Current position and speed confirmed stable.\n\n"
                    "Cargo: 12,100 MT Ethane — integrity confirmed, no BOG concerns at current rate.\n"
                    "BOG rate: 0.12%/day (within normal parameters).\n\n"
                    "Next update: 1800 UTC today.\n\n"
                    "Regards,\nCaptain R. Svensson\nMaster, JS Ineos Innovation"
                ),
                "ai_priority": "High",
                "ai_summary": "JS Ineos Innovation delayed 14 hours — storm avoidance at N Atlantic. ETA Rafnes revised to 12-Jun 20:00. Cargo safe, BOG nominal.",
                "ai_action_required": "Assess delay options: (1) accelerate vessel, (2) maintain speed + swap coverage, (3) financial hedge. Notify Rafnes plant team.",
                "deadline_hours": 4.0,
                "received_offset_hours": -0.3,
            },
            # 6 — Trafigura NGL inquiry
            {
                "direction": "Inbound",
                "from_email": "d.lim@trafigura.com",
                "from_name": "David Lim",
                "from_company": "Trafigura",
                "subject": "NGL enquiry — 20,000 MT Jul-Aug delivery, NWE",
                "body": (
                    "Hi Alex,\n\n"
                    "We are looking to purchase 20,000 MT NGLs (propane/butane mix acceptable) for "
                    "delivery July-August to NWE ports (Rotterdam or Grangemouth preferred).\n\n"
                    "Can you provide a bid? We'd need to hear back by EOD London tomorrow.\n\n"
                    "Best,\nDavid Lim\nTrafigura"
                ),
                "ai_priority": "Medium",
                "ai_summary": "Trafigura seeking 20,000 MT NGL purchase (Jul-Aug, NWE). Requesting INEOS bid by EOD tomorrow.",
                "ai_action_required": "Evaluate available NGL inventory and provide bid by EOD tomorrow",
                "deadline_hours": 28.0,
                "received_offset_hours": -2.0,
            },
            # 7 — Gunvor forward sale interest
            {
                "direction": "Inbound",
                "from_email": "n.smirnov@gunvor.com",
                "from_name": "Nikolai Smirnov",
                "from_company": "Gunvor",
                "subject": "Q3 Ethane — Potential Forward Sale Discussion",
                "body": (
                    "Alex,\n\n"
                    "Following our call last week, we'd like to formally express interest in discussing a "
                    "Q3 2026 forward ethane sale arrangement — specifically Aug-Sep delivery to NWE.\n\n"
                    "Volumes: 10,000-12,000 MT/cargo, 2 cargoes\n"
                    "Basis: Argus NWE Ethane assessment + premium TBD\n\n"
                    "Are you available for a call Thursday afternoon?\n\n"
                    "Best,\nNikolai Smirnov\nGunvor"
                ),
                "ai_priority": "Medium",
                "ai_summary": "Gunvor interested in 2x Q3 ethane forward sales (10-12K MT each, NWE). Requesting call Thursday.",
                "ai_action_required": "Confirm call availability and check Q3 Dragon fleet schedule for capacity",
                "deadline_hours": 48.0,
                "received_offset_hours": -3.0,
            },
            # 8 — EMIR regulatory reminder
            {
                "direction": "Inbound",
                "from_email": "compliance@ineos-ts.com",
                "from_name": "INEOS T&S Compliance Team",
                "from_company": "INEOS T&S Compliance",
                "subject": "ACTION REQUIRED: EMIR Refit — 3 Derivative Trades Missing LEI Data",
                "body": (
                    "Dear Traders,\n\n"
                    "As part of EMIR Refit compliance (effective April 2024), the following trades "
                    "in your book require updated LEI (Legal Entity Identifier) data before the next "
                    "reporting cycle (deadline: 48 hours):\n\n"
                    "• RMVT-2026-0341 — Brent Swap, Vitol — missing counterparty UTI\n"
                    "• RMVT-2026-0398 — WTI Option, BP — missing trade venue MIC code\n"
                    "• RMVT-2026-0412 — EUA Exchange, ICE — missing reporting timestamp\n\n"
                    "Please liaise with Middle Office to provide missing data.\n\n"
                    "Non-compliance: potential €500,000 penalty per unreported transaction.\n\n"
                    "INEOS T&S Compliance"
                ),
                "ai_priority": "High",
                "ai_summary": "EMIR Refit: 3 derivative trades missing LEI/UTI data. Reporting deadline 48 hours. Potential €500K penalty per trade.",
                "ai_action_required": "Forward to middle office with urgency — provide missing LEI/UTI data within 48 hours",
                "deadline_hours": 48.0,
                "received_offset_hours": -4.0,
            },
            # 9 — Bloomberg market commentary (FYI)
            {
                "direction": "Inbound",
                "from_email": "research@bloomberg.com",
                "from_name": "Bloomberg Commodities Research",
                "from_company": "Bloomberg",
                "subject": "Crude Outlook — OPEC+ June Meeting Preview: Split Emerging on Cuts",
                "body": (
                    "Bloomberg Commodities Research | Morning Note | 31 May 2026\n\n"
                    "OPEC+ JUNE MEETING PREVIEW: DISSENT EMERGING\n\n"
                    "Our sources indicate that 3 OPEC+ members (UAE, Iraq, Kazakhstan) are privately "
                    "lobbying for partial production increase at the June 5 meeting, citing budget revenue "
                    "pressures. Saudi Arabia is expected to push back.\n\n"
                    "KEY LEVELS:\n"
                    "• Brent support: $80.20 (50-day MA)\n"
                    "• Brent resistance: $85.40 (Jan 2026 high)\n"
                    "• WTI support: $76.80\n\n"
                    "IMPLICATIONS: If split materialises, Brent could test $80 ahead of meeting. "
                    "Spread traders watch Brent/Dubai EFS for early signal.\n\n"
                    "Bloomberg Intelligence"
                ),
                "ai_priority": "Medium",
                "ai_summary": "Bloomberg: OPEC+ June meeting — UAE/Iraq/Kazakhstan may push for output increase. Brent support $80.20. Potential spread impact.",
                "ai_action_required": "Review crude book exposure ahead of June 5 OPEC+ meeting. Consider reducing directional longs.",
                "deadline_hours": 96.0,
                "received_offset_hours": -5.0,
            },
            # 10 — Executive EOD summary request
            {
                "direction": "Inbound",
                "from_email": "j.hartley@ineos-ts.com",
                "from_name": "James Hartley",
                "from_company": "INEOS T&S Executive",
                "subject": "EOD Summary Needed — Board Prep for Monday",
                "body": (
                    "Alex,\n\n"
                    "Board meeting Monday morning. I need a brief P&L and position summary by 17:30 today:\n\n"
                    "1. Today's realised P&L (crude, ethane, NGLs, carbon)\n"
                    "2. YTD vs target\n"
                    "3. Key open positions and risk\n"
                    "4. Any material alerts or decisions pending\n\n"
                    "2 pages max. Thanks.\n\n"
                    "James"
                ),
                "ai_priority": "High",
                "ai_summary": "Head of Trading requesting EOD P&L and position summary for Monday board prep. Due 17:30 today.",
                "ai_action_required": "Generate EOD executive summary — P&L, positions, alerts — by 17:30",
                "deadline_hours": 9.5,
                "received_offset_hours": -6.0,
            },
            # 11 — Goldman Sachs crude outlook note
            {
                "direction": "Inbound",
                "from_email": "commodities.research@gs.com",
                "from_name": "Goldman Sachs Commodities Research",
                "from_company": "Goldman Sachs",
                "subject": "GS Commodities: Brent 3-Month Target Revised to $88/bbl on Supply Tightening",
                "body": (
                    "Goldman Sachs Commodities Research | Client Note | 31 May 2026\n\n"
                    "BRENT TARGET UPGRADED TO $88/BBL (3-MONTH HORIZON)\n\n"
                    "We revise our Brent 3-month forecast from $84 to $88/bbl based on:\n\n"
                    "1. OPEC+ compliance above 95% through April\n"
                    "2. Global demand surprise: Q1 2026 demand 1.2M bbl/day above Dec consensus\n"
                    "3. Non-OPEC supply underperformance (Guyana ramp slower than expected)\n\n"
                    "RISK: June OPEC+ meeting — upside cut extension vs downside production increase.\n\n"
                    "TRADING RECOMMENDATIONS:\n"
                    "• Buy Brent M+2 on dips below $82\n"
                    "• Brent/WTI spread widening expected — structure: long Brent, short WTI\n\n"
                    "Goldman Sachs Commodities Research\n"
                    "This is a market commentary. Not investment advice."
                ),
                "ai_priority": "Medium",
                "ai_summary": "Goldman Sachs upgrades Brent to $88/bbl 3-month target. Recommends buying dips below $82 and long Brent/short WTI spread.",
                "ai_action_required": "Review alignment with current book positioning. Desk Brain: check for historical precedent on similar GS upgrade events.",
                "deadline_hours": 168.0,
                "received_offset_hours": -7.0,
            },
        ]

        emails = []
        for e in emails_data:
            received_at = now + timedelta(hours=e.get("received_offset_hours", 0))
            deadline_hours = e.get("deadline_hours")
            deadline = now + timedelta(hours=deadline_hours) if deadline_hours else None

            emails.append(Email(
                user_id=trader.id,
                direction=e["direction"],
                from_email=e["from_email"],
                from_name=e["from_name"],
                to_email=trader.email,
                subject=e["subject"],
                body=e["body"],
                received_at=received_at,
                ai_summary=e["ai_summary"],
                ai_priority=e["ai_priority"],
                ai_action_required=e["ai_action_required"],
                deadline=deadline,
                status="Unread",
            ))

        db.add_all(emails)
        db.commit()
        logger.info(f"Seeded {len(emails)} emails.")
        return len(emails)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_emails error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_emails()
