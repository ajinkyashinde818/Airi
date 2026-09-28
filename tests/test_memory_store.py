import pytest
from memory.memory_store import MemoryStore


def test_memory_store_save_and_retrieve():
    store = MemoryStore()
    store.save_long_term("user_name", "Alex", category="user_info")
    retrieved = store.retrieve_long_term("user_name")
    assert retrieved is not None
    assert retrieved["value"] == "Alex"
    assert retrieved["category"] == "user_info"


def test_memory_store_search():
    store = MemoryStore()
    store.save_long_term("favorite_color", "blue")
    store.save_long_term("favorite_food", "pizza")
    results = store.search_long_term("favorite")
    assert len(results) == 2


def test_memory_store_delete():
    store = MemoryStore()
    store.save_long_term("temp_key", "val")
    assert store.delete_long_term("temp_key") is True
    assert store.retrieve_long_term("temp_key") is None
