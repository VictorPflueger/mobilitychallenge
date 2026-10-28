import numpy as np

class RandomController:
    
    def __init__(self, action_size):
        self.action_size = action_size

    def act(self, observations):
        actions = dict()
        return np.random.randint(self.action_size)
