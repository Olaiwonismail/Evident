import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Member(Base):
    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collective_id: Mapped[str] = mapped_column(String, ForeignKey("collectives.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="member")  # organizer, committee, member
    # each member gets their own dedicated pay-in account, so a transfer into it
    # is unambiguously theirs — no sender-matching guesswork.
    bank_account_number: Mapped[str] = mapped_column(String, nullable=True)
    bank_name: Mapped[str] = mapped_column(String, nullable=True)
    virtual_account_id: Mapped[str] = mapped_column(String, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    collective: Mapped["Collective"] = relationship("Collective", back_populates="members")
    contributions: Mapped[list["Contribution"]] = relationship("Contribution", back_populates="member")
