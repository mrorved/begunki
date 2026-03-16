from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime,
    ForeignKey, Text, Boolean
)
from sqlalchemy.orm import relationship
from app.database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="department")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(200))
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="agent")  # admin | director | head | agent
    is_active = Column(Boolean, default=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    department = relationship("Department", back_populates="users")
    clients = relationship("Client", back_populates="agent")
    orders = relationship("Order", back_populates="agent")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    grd_code = Column(String(50), nullable=False)
    price = Column(Float, nullable=False, default=0)
    package = Column(Integer, default=1)
    stock = Column(Integer, default=0)
    type = Column(String(200), index=True)
    manufacturer = Column(String(200), index=True)
    photo = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    inn = Column(String(20))
    phone = Column(String(50))
    email = Column(String(200))
    contact_person = Column(String(200))
    city = Column(String(100))
    address = Column(Text)
    comment = Column(Text)
    status = Column(String(50), default="new")  # new | potential | revived | active
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("User", back_populates="clients")
    orders = relationship("Order", back_populates="client")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    discount = Column(Float, default=0)
    total = Column(Float, default=0)
    status = Column(String(20), default="draft")  # draft | submitted | processing | exported

    agent = relationship("User", back_populates="orders")
    client = relationship("Client", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_code = Column(String(50), nullable=False)
    grd_code = Column(String(50), nullable=False)
    product_name = Column(String(500))
    qty = Column(Integer, default=1)
    price = Column(Float, nullable=False)
    total = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
