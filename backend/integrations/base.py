from abc import ABC, abstractmethod
from typing import AsyncIterator
from models.order import OrderCreate


class BaseIntegration(ABC):
    """
    Contract every marketplace integration must implement.
    sync_service calls fetch_pending_orders() and receives a uniform
    stream of OrderCreate objects regardless of the source.
    """

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Identifies the source: 'falabella', 'mercadolibre', etc."""
        ...

    @abstractmethod
    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """
        Yields OrderCreate objects for all pending/actionable orders.
        Handles pagination internally.
        Raises IntegrationError on unrecoverable failures.
        """
        ...


class IntegrationError(Exception):
    """Raised when an integration cannot recover from an API error."""
    def __init__(self, source: str, message: str, status_code: int = 0):
        self.source = source
        self.status_code = status_code
        super().__init__(f"[{source}] {message}")
