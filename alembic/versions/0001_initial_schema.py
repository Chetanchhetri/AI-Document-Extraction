"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-02 06:35:25.110547
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=320), nullable=False),
    sa.Column('hashed_password', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
    sa.Column('role', sa.Enum('super_admin', 'manager', 'executive', name='role'), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('shipments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_code', sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False),
    sa.Column('supplier_name', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
    sa.Column('status', sa.Enum('ingested', 'processing', 'needs_review', 'approved', 'exported', name='shipmentstatus'), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_shipments_created_by_id'), 'shipments', ['created_by_id'], unique=False)
    op.create_index(op.f('ix_shipments_shipment_code'), 'shipments', ['shipment_code'], unique=True)
    op.create_index(op.f('ix_shipments_supplier_name'), 'shipments', ['supplier_name'], unique=False)
    op.create_table('cross_checks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_id', sa.Integer(), nullable=False),
    sa.Column('check_name', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('status', sa.Enum('passed', 'failed', 'overridden', name='checkstatus'), nullable=False),
    sa.Column('source_value_1', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
    sa.Column('source_value_2', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
    sa.Column('variance_note', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
    sa.Column('overridden_by_id', sa.Integer(), nullable=True),
    sa.Column('override_reason', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
    sa.ForeignKeyConstraint(['overridden_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cross_checks_check_name'), 'cross_checks', ['check_name'], unique=False)
    op.create_index(op.f('ix_cross_checks_shipment_id'), 'cross_checks', ['shipment_id'], unique=False)
    op.create_table('documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_id', sa.Integer(), nullable=False),
    sa.Column('doc_type', sa.Enum('invoice', 'packing_list', 'bill_of_lading', name='doctype'), nullable=False),
    sa.Column('file_path', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('file_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('file_size_bytes', sa.Integer(), nullable=False),
    sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('sha256', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('page_count', sa.Integer(), nullable=False),
    sa.Column('extraction_status', sa.Enum('pending', 'processing', 'done', 'manual_review', name='extractionstatus'), nullable=False),
    sa.Column('extraction_error', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_sha256'), 'documents', ['sha256'], unique=False)
    op.create_index(op.f('ix_documents_shipment_id'), 'documents', ['shipment_id'], unique=False)
    op.create_table('shipment_line_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_id', sa.Integer(), nullable=False),
    sa.Column('item_description', sa.Text(), nullable=False),
    sa.Column('hsn_code', sqlmodel.sql.sqltypes.AutoString(length=16), nullable=True),
    sa.Column('quantity', sa.Float(), nullable=False),
    sa.Column('unit_price', sa.Float(), nullable=False),
    sa.Column('currency', sqlmodel.sql.sqltypes.AutoString(length=8), nullable=False),
    sa.Column('total_amount', sa.Float(), nullable=False),
    sa.Column('gross_weight_kg', sa.Float(), nullable=True),
    sa.Column('embedding', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_shipment_line_items_hsn_code'), 'shipment_line_items', ['hsn_code'], unique=False)
    op.create_index(op.f('ix_shipment_line_items_shipment_id'), 'shipment_line_items', ['shipment_id'], unique=False)
    op.create_table('extracted_fields',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('field_name', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('field_value', sa.Text(), nullable=False),
    sa.Column('confidence_score', sa.Float(), nullable=False),
    sa.Column('is_low_confidence', sa.Boolean(), nullable=False),
    sa.Column('is_human_verified', sa.Boolean(), nullable=False),
    sa.Column('bounding_box', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id', 'field_name', name='uq_field_per_document')
    )
    op.create_index(op.f('ix_extracted_fields_document_id'), 'extracted_fields', ['document_id'], unique=False)
    op.create_index(op.f('ix_extracted_fields_field_name'), 'extracted_fields', ['field_name'], unique=False)
    op.create_index(op.f('ix_extracted_fields_shipment_id'), 'extracted_fields', ['shipment_id'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('extracted_field_id', sa.Integer(), nullable=True),
    sa.Column('cross_check_id', sa.Integer(), nullable=True),
    sa.Column('shipment_id', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('previous_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=40), nullable=False),
    sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['cross_check_id'], ['cross_checks.id'], ),
    sa.ForeignKeyConstraint(['extracted_field_id'], ['extracted_fields.id'], ),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_cross_check_id'), 'audit_logs', ['cross_check_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_extracted_field_id'), 'audit_logs', ['extracted_field_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_shipment_id'), 'audit_logs', ['shipment_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_shipment_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_extracted_field_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_cross_check_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_extracted_fields_shipment_id'), table_name='extracted_fields')
    op.drop_index(op.f('ix_extracted_fields_field_name'), table_name='extracted_fields')
    op.drop_index(op.f('ix_extracted_fields_document_id'), table_name='extracted_fields')
    op.drop_table('extracted_fields')
    op.drop_index(op.f('ix_shipment_line_items_shipment_id'), table_name='shipment_line_items')
    op.drop_index(op.f('ix_shipment_line_items_hsn_code'), table_name='shipment_line_items')
    op.drop_table('shipment_line_items')
    op.drop_index(op.f('ix_documents_shipment_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_sha256'), table_name='documents')
    op.drop_table('documents')
    op.drop_index(op.f('ix_cross_checks_shipment_id'), table_name='cross_checks')
    op.drop_index(op.f('ix_cross_checks_check_name'), table_name='cross_checks')
    op.drop_table('cross_checks')
    op.drop_index(op.f('ix_shipments_supplier_name'), table_name='shipments')
    op.drop_index(op.f('ix_shipments_shipment_code'), table_name='shipments')
    op.drop_index(op.f('ix_shipments_created_by_id'), table_name='shipments')
    op.drop_table('shipments')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    # PostgreSQL keeps ENUM types after the tables are dropped
    bind = op.get_bind()
    for name in ("role", "shipmentstatus", "doctype", "extractionstatus", "checkstatus"):
        sa.Enum(name=name).drop(bind, checkfirst=True)
