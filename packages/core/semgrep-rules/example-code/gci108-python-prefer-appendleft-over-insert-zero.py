# This will be flagged:
my_deque.insert(0, item)
queue.insert(0, element)

# Suggested replacement:
my_deque.appendleft(item)
queue.appendleft(element)